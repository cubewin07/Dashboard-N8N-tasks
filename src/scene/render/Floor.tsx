import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { WallSegment } from '@/domain/config'
import { getFloorFadeTarget, useViewStore } from '@/scene/camera/viewStore'
import type { FloorLayout } from '@/scene/layout'
import { applyGroupFade, stepFadeOpacity } from './FloorFade'
import { FloorLabel, type FloorLabelChip } from './FloorLabel'
import { getSwatchColor, getSwatchSoftColor, SCENE_PALETTE } from './palette'

interface WallBoxPiece {
  key: string
  pos: [number, number, number]
  size: [number, number, number]
}

const WALL_HEIGHT = 2.8
const WALL_THICKNESS = 0.16
const DOOR_HEIGHT = 2.15
const SLAB_THICKNESS = 0.3

function buildWallPieces(walls: readonly WallSegment[]): WallBoxPiece[] {
  const pieces: WallBoxPiece[] = []

  walls.forEach((wall, idx) => {
    const dx = wall.x2 - wall.x1
    const dz = wall.z2 - wall.z1
    const length = Math.hypot(dx, dz)
    if (length < 0.05) return

    const isHorizontal = Math.abs(dx) >= Math.abs(dz)
    const ux = dx / length
    const uz = dz / length

    const pushSegment = (startOffset: number, segLen: number, yBottom: number, h: number, suffix: string) => {
      if (segLen <= 0.02 || h <= 0.02) return
      const midDist = startOffset + segLen / 2
      const cx = wall.x1 + ux * midDist
      const cz = wall.z1 + uz * midDist
      const cy = yBottom + h / 2
      const size: [number, number, number] = isHorizontal
        ? [segLen, h, WALL_THICKNESS]
        : [WALL_THICKNESS, h, segLen]
      pieces.push({
        key: `w_${idx}_${suffix}`,
        pos: [cx, cy, cz],
        size,
      })
    }

    if (!wall.door) {
      pushSegment(0, length, 0, WALL_HEIGHT, 'full')
      return
    }

    const doorStart = Math.max(0, Math.min(length, wall.door.offset))
    const doorEnd = Math.max(doorStart, Math.min(length, wall.door.offset + wall.door.width))
    const lintelHeight = WALL_HEIGHT - DOOR_HEIGHT

    pushSegment(0, doorStart, 0, WALL_HEIGHT, 'before')
    pushSegment(doorStart, doorEnd - doorStart, DOOR_HEIGHT, lintelHeight, 'lintel')
    pushSegment(doorEnd, length - doorEnd, 0, WALL_HEIGHT, 'after')
  })

  return pieces
}

export interface FloorProps {
  floor: FloorLayout
  activeFloorIndex: number | null
  animateMount?: boolean
  reducedMotion?: boolean
  chips?: readonly FloorLabelChip[]
}

export function Floor({
  floor,
  activeFloorIndex,
  animateMount = false,
  reducedMotion = false,
  chips,
}: FloorProps) {
  const groupRef = useRef<THREE.Group>(null)
  const fadeContentRef = useRef<THREE.Group>(null)
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const opacityRef = useRef(1)
  const scaleProgressRef = useRef(animateMount && !reducedMotion ? 0.01 : 1)
  const [labelOpacity, setLabelOpacity] = useState(1)

  const hoveredFloorKey = useViewStore((s) => s.hoveredFloorKey)
  const focusedFloorKey = useViewStore((s) => s.focusedFloorKey)
  const setHoveredFloor = useViewStore((s) => s.setHoveredFloor)
  const focusFloor = useViewStore((s) => s.focusFloor)

  const isHovered = hoveredFloorKey === floor.key
  const isFocused = focusedFloorKey === floor.key

  const wallPieces = useMemo(() => buildWallPieces(floor.walls), [floor.walls])
  const swatchColor = getSwatchColor(floor.colorSwatch)
  const swatchSoftColor = getSwatchSoftColor(floor.colorSwatch)
  const isBoss = floor.kind === 'boss'

  useEffect(() => {
    if (fadeContentRef.current) {
      const target = getFloorFadeTarget(floor.index, activeFloorIndex)
      opacityRef.current = target.opacity
      applyGroupFade(fadeContentRef.current, target.opacity, target.castShadow)
      setLabelOpacity(target.opacity)
    }
  }, [floor.index, activeFloorIndex])

  useFrame((_, delta) => {
    const target = getFloorFadeTarget(floor.index, activeFloorIndex)
    const nextOpacity = stepFadeOpacity(
      opacityRef.current,
      target.opacity,
      delta,
      reducedMotion,
    )
    if (Math.abs(nextOpacity - opacityRef.current) > 0.002 && fadeContentRef.current) {
      opacityRef.current = nextOpacity
      applyGroupFade(fadeContentRef.current, nextOpacity, target.castShadow)
      setLabelOpacity(nextOpacity)
    }

    if (scaleProgressRef.current < 1 && groupRef.current) {
      if (reducedMotion) {
        scaleProgressRef.current = 1
      } else {
        scaleProgressRef.current = Math.min(1, scaleProgressRef.current + delta / 0.35)
      }
      const eased = 1 - Math.pow(1 - scaleProgressRef.current, 3)
      groupRef.current.scale.set(1, Math.max(0.01, eased), 1)
    }
  })

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    pointerDownPosRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
  }

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const down = pointerDownPosRef.current
    pointerDownPosRef.current = null
    if (!down) return
    const travel = Math.hypot(
      e.nativeEvent.clientX - down.x,
      e.nativeEvent.clientY - down.y,
    )
    if (travel < 4) {
      focusFloor(floor.key)
    }
  }

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHoveredFloor(floor.key)
  }

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (useViewStore.getState().hoveredFloorKey === floor.key) {
      setHoveredFloor(null)
    }
  }

  const { w, d } = floor.size

  return (
    <group
      ref={groupRef}
      position={[0, floor.y, 0]}
      name={`floor-${floor.key}`}
    >
      <group ref={fadeContentRef}>
        {isBoss ? (
          <>
            {/* West 6m open roof terrace slab */}
            <mesh position={[3, -SLAB_THICKNESS / 2, d / 2]} castShadow receiveShadow>
              <boxGeometry args={[6, SLAB_THICKNESS, d]} />
              <meshStandardMaterial color={SCENE_PALETTE.slabBossTerrace} roughness={0.85} />
            </mesh>
            {/* Terrace low parapet walls */}
            <mesh position={[3, 0.45, 0.08]} castShadow receiveShadow>
              <boxGeometry args={[6, 0.9, 0.16]} />
              <meshStandardMaterial color={SCENE_PALETTE.bossGoldTrim} roughness={0.6} />
            </mesh>
            <mesh position={[0.08, 0.45, d / 2]} castShadow receiveShadow>
              <boxGeometry args={[0.16, 0.9, d]} />
              <meshStandardMaterial color={SCENE_PALETTE.bossGoldTrim} roughness={0.6} />
            </mesh>
            <mesh position={[3, 0.45, d - 0.08]} castShadow receiveShadow>
              <boxGeometry args={[6, 0.9, 0.16]} />
              <meshStandardMaterial color={SCENE_PALETTE.bossGoldTrim} roughness={0.6} />
            </mesh>

            {/* East 18m indoor executive wood slab */}
            <mesh position={[15, -SLAB_THICKNESS / 2, d / 2]} castShadow receiveShadow>
              <boxGeometry args={[18, SLAB_THICKNESS, d]} />
              <meshStandardMaterial color={SCENE_PALETTE.slabBossWood} roughness={0.7} />
            </mesh>

            {/* Executive suite roof cap */}
            <mesh position={[15, WALL_HEIGHT + 0.12, d / 2]} castShadow receiveShadow>
              <boxGeometry args={[18.3, 0.24, d + 0.3]} />
              <meshStandardMaterial color={SCENE_PALETTE.bossRoofCap} roughness={0.75} />
            </mesh>
            {/* Gold crown trim on roof cap */}
            <mesh position={[15, WALL_HEIGHT + 0.12, -0.05]}>
              <boxGeometry args={[18.35, 0.12, 0.22]} />
              <meshStandardMaterial color={SCENE_PALETTE.bossGoldTrim} roughness={0.5} />
            </mesh>
          </>
        ) : (
          <>
            {/* Standard floor slab */}
            <mesh position={[w / 2, -SLAB_THICKNESS / 2, d / 2]} castShadow receiveShadow>
              <boxGeometry args={[w, SLAB_THICKNESS, d]} />
              <meshStandardMaterial color={SCENE_PALETTE.slabStandard} roughness={0.85} />
            </mesh>
            {/* Soft department floor rug/inlay */}
            <mesh position={[w / 2, 0.005, d / 2]} receiveShadow>
              <boxGeometry args={[w - 0.6, 0.01, d - 0.6]} />
              <meshStandardMaterial color={swatchSoftColor} roughness={0.9} />
            </mesh>
          </>
        )}

        {/* Front facade colour accent strip */}
        <mesh position={[w / 2, -0.06, 0.02]}>
          <boxGeometry args={[w, 0.16, 0.18]} />
          <meshStandardMaterial
            color={isBoss ? SCENE_PALETTE.bossGoldTrim : swatchColor}
            roughness={0.55}
          />
        </mesh>

        {/* Interior and perimeter wall segments */}
        {wallPieces.map((piece) => (
          <mesh key={piece.key} position={piece.pos} castShadow receiveShadow>
            <boxGeometry args={piece.size} />
            <meshStandardMaterial color={SCENE_PALETTE.wallInterior} roughness={0.8} />
          </mesh>
        ))}
      </group>

      {/* Hover / Focus perimeter highlight */}
      {isHovered || isFocused ? (
        <mesh
          position={[w / 2, -SLAB_THICKNESS / 2, d / 2]}
          userData={{ ignoreFade: true }}
        >
          <boxGeometry args={[w + 0.22, SLAB_THICKNESS + 0.08, d + 0.22]} />
          <meshBasicMaterial
            color={isFocused ? SCENE_PALETTE.focusHighlight : SCENE_PALETTE.hoverHighlight}
            wireframe
          />
        </mesh>
      ) : null}

      {/* 3D floor label on front facade */}
      <FloorLabel floor={floor} opacity={labelOpacity} chips={chips} />

      {/* Invisible pick volume for floor hover and click-to-focus */}
      <mesh
        position={[w / 2, WALL_HEIGHT / 2, d / 2]}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        userData={{ ignoreFade: true }}
      >
        <boxGeometry args={[w, WALL_HEIGHT, d]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

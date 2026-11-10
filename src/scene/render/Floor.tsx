import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { WallSegment } from '@/domain/config'
import { usePeopleUi } from '@/office/uiStore'
import { getFloorFadeTarget, useViewStore } from '@/scene/camera/viewStore'
import type { FloorLayout } from '@/scene/layout'
import { toWorldX, toWorldZ } from './coords'
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
const IS_E2E = Boolean(import.meta.env.VITE_E2E)
const tempWallObj = new THREE.Object3D()

function buildWallPieces(
  walls: readonly WallSegment[],
  w: number,
  d: number,
): WallBoxPiece[] {
  const pieces: WallBoxPiece[] = []

  walls.forEach((wall, idx) => {
    const dx = wall.x2 - wall.x1
    const dz = wall.z2 - wall.z1
    const length = Math.hypot(dx, dz)
    if (length < 0.05) return

    const isHorizontal = Math.abs(dx) >= Math.abs(dz)
    const ux = dx / length
    const uz = dz / length

    const pushSegment = (
      startOffset: number,
      segLen: number,
      yBottom: number,
      h: number,
      suffix: string,
    ) => {
      if (segLen <= 0.02 || h <= 0.02) return
      const midDist = startOffset + segLen / 2
      const cx = toWorldX(wall.x1 + ux * midDist, w)
      const cz = toWorldZ(wall.z1 + uz * midDist, d)
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
  /** False once the kit models are drawn: the box walls and parapets step aside. */
  blockoutWalls?: boolean
}

export function Floor({
  floor,
  activeFloorIndex,
  animateMount = false,
  reducedMotion = false,
  chips,
  blockoutWalls = true,
}: FloorProps) {
  const groupRef = useRef<THREE.Group>(null)
  const fadeContentRef = useRef<THREE.Group>(null)
  const wallInstancedRef = useRef<THREE.InstancedMesh>(null)
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const opacityRef = useRef(1)
  const scaleProgressRef = useRef(animateMount && !reducedMotion && !IS_E2E ? 0.01 : 1)
  const targetFade = getFloorFadeTarget(floor.index, activeFloorIndex)
  const invalidate = useThree((s) => s.invalidate)

  const hoveredFloorKey = useViewStore((s) => s.hoveredFloorKey)
  const focusedFloorKey = useViewStore((s) => s.focusedFloorKey)
  const setHoveredFloor = useViewStore((s) => s.setHoveredFloor)
  const focusFloor = useViewStore((s) => s.focusFloor)

  const isHovered = hoveredFloorKey === floor.key
  const isFocused = focusedFloorKey === floor.key

  const { w, d } = floor.size
  const wallPieces = useMemo(
    () => (blockoutWalls ? buildWallPieces(floor.walls, w, d) : []),
    [floor.walls, w, d, blockoutWalls],
  )
  const swatchColor = getSwatchColor(floor.colorSwatch)
  const swatchSoftColor = getSwatchSoftColor(floor.colorSwatch)
  const isBoss = floor.kind === 'boss'
  // Kit walls fill the storey; the blockout walls were shorter.
  const roofY = blockoutWalls ? WALL_HEIGHT : floor.size.h - SLAB_THICKNESS

  useLayoutEffect(() => {
    const mesh = wallInstancedRef.current
    if (!mesh) return
    wallPieces.forEach((piece, idx) => {
      tempWallObj.position.set(piece.pos[0], piece.pos[1], piece.pos[2])
      tempWallObj.rotation.set(0, 0, 0)
      tempWallObj.scale.set(piece.size[0], piece.size[1], piece.size[2])
      tempWallObj.updateMatrix()
      mesh.setMatrixAt(idx, tempWallObj.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [wallPieces])

  useEffect(() => {
    if (fadeContentRef.current) {
      const target = getFloorFadeTarget(floor.index, activeFloorIndex)
      opacityRef.current = target.opacity
      applyGroupFade(fadeContentRef.current, target.opacity, target.castShadow)
      // Floors above the focused one are cut away so its furniture is in plain view.
      fadeContentRef.current.visible = !target.faded
      invalidate()
    }
  }, [floor.index, activeFloorIndex, invalidate])

  useFrame((_, delta) => {
    const target = getFloorFadeTarget(floor.index, activeFloorIndex)
    if (Math.abs(target.opacity - opacityRef.current) > 0.002 && fadeContentRef.current) {
      const nextOpacity = stepFadeOpacity(
        opacityRef.current,
        target.opacity,
        delta,
        reducedMotion,
      )
      opacityRef.current = nextOpacity
      applyGroupFade(fadeContentRef.current, nextOpacity, target.castShadow)
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
    // A click on a person selects the person, not the floor behind them.
    if (travel < 4 && usePeopleUi.getState().hoveredId === null) {
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

  return (
    <group
      ref={groupRef}
      position={[0, floor.y, 0]}
      name={`floor-${floor.key}`}
    >
      <group ref={fadeContentRef}>
        {isBoss ? (
          <>
            {/* West 6m open roof terrace slab (local x: 0..6 -> center x=3) */}
            <mesh
              position={[toWorldX(3, w), -SLAB_THICKNESS / 2, toWorldZ(d / 2, d)]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[6, SLAB_THICKNESS, d]} />
              <meshStandardMaterial color={SCENE_PALETTE.slabBossTerrace} roughness={0.85} />
            </mesh>
            {/* Terrace low parapet walls (until the kit rails load) */}
            {blockoutWalls ? (
              <>
                <mesh position={[toWorldX(3, w), 0.45, toWorldZ(0.08, d)]} receiveShadow>
                  <boxGeometry args={[6, 0.9, 0.16]} />
                  <meshStandardMaterial color={SCENE_PALETTE.bossGoldTrim} roughness={0.6} />
                </mesh>
                <mesh position={[toWorldX(0.08, w), 0.45, toWorldZ(d / 2, d)]} receiveShadow>
                  <boxGeometry args={[0.16, 0.9, d]} />
                  <meshStandardMaterial color={SCENE_PALETTE.bossGoldTrim} roughness={0.6} />
                </mesh>
                <mesh position={[toWorldX(3, w), 0.45, toWorldZ(d - 0.08, d)]} receiveShadow>
                  <boxGeometry args={[6, 0.9, 0.16]} />
                  <meshStandardMaterial color={SCENE_PALETTE.bossGoldTrim} roughness={0.6} />
                </mesh>
              </>
            ) : null}

            {/* East 18m indoor executive wood slab (local x: 6..24 -> center x=15) */}
            <mesh
              position={[toWorldX(15, w), -SLAB_THICKNESS / 2, toWorldZ(d / 2, d)]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[18, SLAB_THICKNESS, d]} />
              <meshStandardMaterial color={SCENE_PALETTE.slabBossWood} roughness={0.7} />
            </mesh>

            {/* Executive suite roof cap: lifts off while this floor is focused */}
            {isFocused ? null : (
              <>
                <mesh
                  position={[toWorldX(15, w), roofY + 0.12, toWorldZ(d / 2, d)]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[18.3, 0.24, d + 0.3]} />
                  <meshStandardMaterial color={SCENE_PALETTE.bossRoofCap} roughness={0.75} />
                </mesh>
                {/* Gold crown trim on roof cap front edge */}
                <mesh position={[toWorldX(15, w), roofY + 0.12, toWorldZ(-0.05, d)]}>
                  <boxGeometry args={[18.35, 0.12, 0.22]} />
                  <meshStandardMaterial color={SCENE_PALETTE.bossGoldTrim} roughness={0.5} />
                </mesh>
              </>
            )}
          </>
        ) : (
          <>
            {/* Standard floor slab */}
            <mesh position={[0, -SLAB_THICKNESS / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[w, SLAB_THICKNESS, d]} />
              <meshStandardMaterial color={SCENE_PALETTE.slabStandard} roughness={0.85} />
            </mesh>
            {/* Soft department floor rug/inlay */}
            <mesh position={[0, 0.005, 0]} receiveShadow>
              <boxGeometry args={[w - 0.6, 0.01, d - 0.6]} />
              <meshStandardMaterial color={swatchSoftColor} roughness={0.9} />
            </mesh>
          </>
        )}

        {/* Front facade colour accent strip along open front edge (local z = 0) */}
        <mesh position={[0, -0.06, toWorldZ(0.02, d)]}>
          <boxGeometry args={[w, 0.16, 0.18]} />
          <meshStandardMaterial
            color={isBoss ? SCENE_PALETTE.bossGoldTrim : swatchColor}
            roughness={0.55}
          />
        </mesh>

        {/* Instanced interior and perimeter wall segments for this floor */}
        {wallPieces.length > 0 ? (
          <instancedMesh
            key={`walls_${wallPieces.length}`}
            ref={wallInstancedRef}
            args={[undefined, undefined, wallPieces.length]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={SCENE_PALETTE.wallInterior} roughness={0.8} />
          </instancedMesh>
        ) : null}
      </group>

      {/* Hover / Focus front edge highlight bar */}
      {isHovered || isFocused ? (
        <mesh
          position={[0, -0.06, toWorldZ(-0.06, d)]}
          userData={{ ignoreFade: true }}
        >
          <boxGeometry args={[w + 0.12, 0.24, 0.24]} />
          <meshBasicMaterial
            color={isFocused ? SCENE_PALETTE.focusHighlight : SCENE_PALETTE.hoverHighlight}
          />
        </mesh>
      ) : null}

      {/* 3D floor label on front facade */}
      <FloorLabel floor={floor} opacity={targetFade.opacity} chips={chips} />

      {/* Invisible pick volume for floor hover and click-to-focus */}
      <mesh
        position={[0, WALL_HEIGHT / 2, 0]}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        userData={{ ignoreFade: true }}
      >
        <boxGeometry args={[w, WALL_HEIGHT, d]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
        />
      </mesh>
    </group>
  )
}

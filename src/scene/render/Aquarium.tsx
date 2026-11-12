import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useViewStore } from '@/scene/camera/viewStore'
import type { BuildingLayout } from '@/scene/layout'
import { toWorldX, toWorldZ } from './coords'
import { getSwatchColor, SCENE_PALETTE } from './palette'
import { activeFloorIndexOf, isCutAway } from './place'

/** Lobby aquarium against the back wall (floor-local metres). */
const TANK = { x: 11, wallGap: 0.45, standH: 0.7, w: 1.6, h: 0.6, d: 0.45 } as const
const FISH_SWATCHES = ['orange_500', 'sky_500', 'pink_600', 'status_waiting', 'teal_600'] as const
const FISH = { length: 0.12, height: 0.06, width: 0.03, speed: 0.35 } as const

const tmp = new THREE.Object3D()

export interface AquariumProps {
  layout: BuildingLayout
  reducedMotion?: boolean
}

/** P05-T12 (R11): a glass tank on the lobby with a few instanced fish. */
export function Aquarium({ layout, reducedMotion = false }: AquariumProps) {
  const groupRef = useRef<THREE.Group>(null)
  const fishRef = useRef<THREE.InstancedMesh>(null)
  const lobby = layout.floors.find((f) => f.kind === 'lobby_cafe' && f.annexIndex === 0) ?? null

  const fishGeometry = useMemo(() => {
    const g = new THREE.ConeGeometry(FISH.height / 2, FISH.length, 5)
    g.rotateZ(-Math.PI / 2) // nose along +x
    g.scale(1, 1, FISH.width / FISH.height)
    return g
  }, [])
  useLayoutEffect(() => () => fishGeometry.dispose(), [fishGeometry])

  // Each fish: own lane depth/height, phase and speed (fixed, not random).
  const lanes = useMemo(
    () =>
      FISH_SWATCHES.map((_, i) => ({
        y: (0.2 + 0.6 * ((i * 0.37) % 1)) * TANK.h,
        z: (((i * 0.53) % 1) - 0.5) * TANK.d * 0.6,
        phase: i * 1.7,
        speed: FISH.speed * (0.7 + 0.15 * i),
      })),
    [],
  )

  useLayoutEffect(() => {
    const mesh = fishRef.current
    if (!mesh) return
    FISH_SWATCHES.forEach((swatch, i) => mesh.setColorAt(i, getSwatchColor(swatch)))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  useFrame(({ clock }) => {
    const group = groupRef.current
    const mesh = fishRef.current
    if (!group || !mesh || !lobby) return
    const active = activeFloorIndexOf(layout, useViewStore.getState())
    group.visible = !isCutAway(lobby.index, active)
    if (!group.visible) return
    const t = reducedMotion ? 0 : clock.elapsedTime
    const span = TANK.w / 2 - FISH.length
    lanes.forEach((lane, i) => {
      const s = Math.sin(t * lane.speed + lane.phase)
      const dir = Math.cos(t * lane.speed + lane.phase) >= 0 ? 1 : -1
      tmp.position.set(s * span, TANK.standH + lane.y, lane.z)
      tmp.rotation.set(0, dir > 0 ? 0 : Math.PI, 0)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  if (!lobby) return null
  const { w, d } = lobby.size
  return (
    <group
      ref={groupRef}
      name="lobby-aquarium"
      position={[toWorldX(TANK.x, w), lobby.y, toWorldZ(d - TANK.wallGap, d)]}
    >
      <mesh position={[0, TANK.standH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[TANK.w + 0.1, TANK.standH, TANK.d + 0.1]} />
        <meshStandardMaterial color={SCENE_PALETTE.blockout.coffeeCounter} roughness={0.8} />
      </mesh>
      <mesh position={[0, TANK.standH + TANK.h / 2, 0]} renderOrder={2}>
        <boxGeometry args={[TANK.w, TANK.h, TANK.d]} />
        <meshStandardMaterial
          color={SCENE_PALETTE.glassTint}
          transparent
          opacity={0.35}
          depthWrite={false}
          roughness={0.1}
        />
      </mesh>
      <instancedMesh
        ref={fishRef}
        args={[fishGeometry, undefined, FISH_SWATCHES.length]}
        frustumCulled={false}
      >
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
    </group>
  )
}

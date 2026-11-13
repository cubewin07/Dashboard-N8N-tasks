import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useViewStore } from '@/scene/camera/viewStore'
import type { BuildingLayout } from '@/scene/layout'
import { toWorldX, toWorldZ } from './coords'
import { SCENE_PALETTE } from './palette'
import { LiveNodes, type NodePose } from './LiveNodes'
import { LIFE, useFurniture, useModelReady } from './liveParts'
import { activeFloorIndexOf, isCutAway } from './place'

/** Ceiling fans: two per floor, hanging under the slab above. */
const FAN = {
  xShares: [0.3, 0.6],
  zShare: 0.5,
  bladeY: 2.75,
  bladeLength: 1.1,
  bladeWidth: 0.12,
  /** Gap kept under the next floor's slab. */
  slabGap: 0.32,
  turnsPerSecond: 0.7,
} as const

const tmp = new THREE.Object3D()

/** Rod + hub + two crossed blades as one geometry, pivoting about its rod. */
function buildFanGeometry(rodLength: number): THREE.BufferGeometry {
  const blades = new THREE.BoxGeometry(FAN.bladeLength, 0.02, FAN.bladeWidth)
  const blades2 = new THREE.BoxGeometry(FAN.bladeWidth, 0.02, FAN.bladeLength)
  const hub = new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10)
  const rod = new THREE.CylinderGeometry(0.015, 0.015, rodLength, 6).translate(0, rodLength / 2, 0)
  const parts = [blades, blades2, hub, rod].map((g) => g.toNonIndexed())
  const merged = mergeGeometries(parts)
  for (const g of [blades, blades2, rod, ...parts]) g.dispose()
  if (!merged) return hub
  hub.dispose()
  return merged
}

export interface FansProps {
  layout: BuildingLayout
  reducedMotion?: boolean
}

/** P05-T12 (R11): ceiling fans, still under reduced motion. */
export function Fans({ layout, reducedMotion = false }: FansProps) {
  const furniture = useFurniture(layout)
  const fanModel = LIFE?.fan.model
  const ready = useModelReady(fanModel)
  const fans = useMemo(() => furniture.filter((p) => p.model === fanModel), [furniture, fanModel])
  const pose = useMemo<NodePose>(
    () => (_p, i, elapsed, rotation) => {
      const angle = reducedMotion ? 0.4 : elapsed * FAN.turnsPerSecond * Math.PI * 2
      rotation.set(0, angle + i * 0.9, 0)
    },
    [reducedMotion],
  )
  if (LIFE && fanModel && ready && fans.length > 0) {
    return (
      <LiveNodes
        name="ceiling-fans"
        layout={layout}
        model={fanModel}
        node={LIFE.fan.blades}
        placements={fans}
        pose={pose}
      />
    )
  }
  return <PrimitiveFans layout={layout} reducedMotion={reducedMotion} />
}

/** P05 fallback while the fan model is not loaded. */
function PrimitiveFans({ layout, reducedMotion = false }: FansProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const rodLength = Math.max(0.05, layout.floorHeight - FAN.slabGap - FAN.bladeY)
  const geometry = useMemo(() => buildFanGeometry(rodLength), [rodLength])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  const spots = useMemo(
    () =>
      // The boss floor has its own roof right above it: no hanging fans.
      layout.floors.filter((f) => f.kind !== 'boss').flatMap((f) =>
        FAN.xShares.map((share) => ({
          floorIndex: f.index,
          x: toWorldX(f.size.w * share, f.size.w),
          y: f.y + FAN.bladeY,
          z: toWorldZ(f.size.d * FAN.zShare, f.size.d),
        })),
      ),
    [layout],
  )
  const count = Math.max(1, spots.length)

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const active = activeFloorIndexOf(layout, useViewStore.getState())
    const angle = reducedMotion ? 0.4 : clock.elapsedTime * FAN.turnsPerSecond * Math.PI * 2
    spots.forEach((s, i) => {
      tmp.position.set(s.x, s.y, s.z)
      tmp.rotation.set(0, angle + i * 0.9, 0)
      tmp.scale.setScalar(isCutAway(s.floorIndex, active) ? 0 : 1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      key={count}
      ref={meshRef}
      name="ceiling-fans"
      args={[geometry, undefined, count]}
      frustumCulled={false}
    >
      <meshStandardMaterial color={SCENE_PALETTE.stairsRail} roughness={0.5} />
    </instancedMesh>
  )
}

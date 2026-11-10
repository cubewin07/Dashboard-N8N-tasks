import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { BuildingLayout } from '@/scene/layout'
import { toWorldX, toWorldZ } from './coords'
import { SCENE_PALETTE } from './palette'

export interface StairwellProps {
  layout: BuildingLayout
}

const tempObj = new THREE.Object3D()

export function Stairwell({ layout }: StairwellProps) {
  const rampMeshRef = useRef<THREE.InstancedMesh>(null)
  const landingMeshRef = useRef<THREE.InstancedMesh>(null)

  const firstFloor = layout.floors[0]
  const flightCount = Math.max(0, layout.floors.length - 1)

  const transforms = useMemo(() => {
    if (!firstFloor || flightCount === 0) {
      return { ramps: [], landings: [], rampLen: 1 }
    }
    const { w, d, h: floorH } = firstFloor.size
    const entry = firstFloor.stairsEntrySlot
    const rampRunZ = 2.4
    const rampLen = Math.hypot(rampRunZ, floorH / 2)
    const rampPitch = Math.atan2(floorH / 2, rampRunZ)
    const baseX = toWorldX(entry.x + 0.6, w)
    const baseZ = toWorldZ(entry.z, d)

    const ramps: Array<{ pos: [number, number, number]; rotX: number }> = []
    const landings: Array<[number, number, number]> = []

    for (let i = 0; i < flightCount; i += 1) {
      const y0 = i * floorH
      const yMid = y0 + floorH / 2
      ramps.push({
        pos: [baseX - 0.45, y0 + floorH * 0.25, baseZ],
        rotX: rampPitch,
      })
      ramps.push({
        pos: [baseX + 0.45, y0 + floorH * 0.75, baseZ],
        rotX: -rampPitch,
      })
      landings.push([baseX, yMid, baseZ - rampRunZ / 2 - 0.45])
    }

    return { ramps, landings, rampLen }
  }, [firstFloor, flightCount])

  useLayoutEffect(() => {
    const rampMesh = rampMeshRef.current
    if (rampMesh) {
      transforms.ramps.forEach((r, idx) => {
        tempObj.position.set(r.pos[0], r.pos[1], r.pos[2])
        tempObj.rotation.set(r.rotX, 0, 0)
        tempObj.scale.set(1, 1, 1)
        tempObj.updateMatrix()
        rampMesh.setMatrixAt(idx, tempObj.matrix)
      })
      rampMesh.instanceMatrix.needsUpdate = true
      rampMesh.computeBoundingSphere()
    }

    const landingMesh = landingMeshRef.current
    if (landingMesh) {
      transforms.landings.forEach((pos, idx) => {
        tempObj.position.set(pos[0], pos[1], pos[2])
        tempObj.rotation.set(0, 0, 0)
        tempObj.scale.set(1, 1, 1)
        tempObj.updateMatrix()
        landingMesh.setMatrixAt(idx, tempObj.matrix)
      })
      landingMesh.instanceMatrix.needsUpdate = true
      landingMesh.computeBoundingSphere()
    }
  }, [transforms])

  if (!firstFloor || flightCount === 0) {
    return null
  }

  return (
    <group name="stairwell">
      <instancedMesh
        ref={rampMeshRef}
        args={[undefined, undefined, transforms.ramps.length]}
        receiveShadow
      >
        <boxGeometry args={[0.85, 0.14, transforms.rampLen]} />
        <meshStandardMaterial color={SCENE_PALETTE.stairsRamp} roughness={0.8} />
      </instancedMesh>

      <instancedMesh
        ref={landingMeshRef}
        args={[undefined, undefined, transforms.landings.length]}
        receiveShadow
      >
        <boxGeometry args={[1.8, 0.14, 0.9]} />
        <meshStandardMaterial color={SCENE_PALETTE.stairsRail} roughness={0.75} />
      </instancedMesh>
    </group>
  )
}

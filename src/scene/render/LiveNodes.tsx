import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useViewStore } from '@/scene/camera/viewStore'
import type { BuildingLayout } from '@/scene/layout'
import { getSharedMaterials } from './assets/materials'
import { getNodeParts } from './assets/modelStore'
import type { Placement } from './assets/placements'
import { flagInstances, nodeMatrix, useModelReady, ZERO_MATRIX } from './liveParts'
import { activeFloorIndexOf, isCutAway } from './place'

/** Writes the node's pose for one placement; return false to hide it this frame. */
export type NodePose = (
  p: Placement,
  index: number,
  elapsed: number,
  rotation: THREE.Euler,
  offset: THREE.Vector3,
) => boolean | void

export interface LiveNodesProps {
  name: string
  layout: BuildingLayout
  model: string
  node: string
  placements: readonly Placement[]
  pose: NodePose
}

const tmpMatrix = new THREE.Matrix4()
const tmpEuler = new THREE.Euler()
const tmpOffset = new THREE.Vector3()

/**
 * One moving node (clock hands, fan blades, fish) of every placement of a
 * model, instanced: one draw call per material for the whole building. The
 * static bake leaves the node out (`Placement.omit`), so nothing doubles.
 */
export function LiveNodes({ name, layout, model, node, placements, pose }: LiveNodesProps) {
  const ready = useModelReady(model)
  const parts = useMemo(() => (ready ? getNodeParts(model, node) : null), [ready, model, node])
  const refs = useRef<Array<THREE.InstancedMesh | null>>([])
  const capacity = Math.max(1, placements.length)

  useLayoutEffect(() => {
    for (const mesh of refs.current) {
      if (!mesh) continue
      for (let i = 0; i < capacity; i += 1) mesh.setMatrixAt(i, ZERO_MATRIX)
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [parts, capacity])

  useFrame(({ clock }) => {
    if (!parts) return
    const active = activeFloorIndexOf(layout, useViewStore.getState())
    const meshes = refs.current
    placements.forEach((p, i) => {
      tmpEuler.set(0, 0, 0)
      tmpOffset.set(0, 0, 0)
      const shown = !isCutAway(p.floorIndex, active) && pose(p, i, clock.elapsedTime, tmpEuler, tmpOffset) !== false
      const m = shown ? nodeMatrix(p, parts.pivot, tmpEuler, tmpMatrix, tmpOffset) : ZERO_MATRIX
      for (const mesh of meshes) mesh?.setMatrixAt(i, m)
    })
    meshes.forEach(flagInstances)
  })

  if (!parts || placements.length === 0) return null
  const materials = getSharedMaterials()
  return (
    <group name={name}>
      {parts.parts.map((part, k) => (
        <instancedMesh
          key={`${part.kind}:${capacity}`}
          ref={(el) => {
            refs.current[k] = el
          }}
          args={[part.geometry, materials[part.kind], capacity]}
          frustumCulled={false}
          castShadow={false}
          receiveShadow={part.kind !== 'glass'}
          renderOrder={part.kind === 'glass' ? 2 : 0}
        />
      ))}
    </group>
  )
}

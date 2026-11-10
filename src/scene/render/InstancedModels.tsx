import { useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getSharedMaterials } from './assets/materials'
import { getManifest, getModelParts, type ModelPart } from './assets/modelStore'
import type { Placement } from './assets/placements'
import { useModelsVersion } from './assets/useModels'

const temp = new THREE.Object3D()

interface BatchProps {
  part: ModelPart
  placements: readonly Placement[]
  capacity: number
  castShadow: boolean
}

/**
 * Only sizeable pieces go into the shadow pass: every caster is one more draw
 * call, and a mug's shadow is invisible at building scale.
 */
function castsShadow(model: string): boolean {
  const entry = getManifest()?.files[model]
  if (!entry) return false
  const height = entry.bbox.max[1] - entry.bbox.min[1]
  const width = Math.max(
    entry.bbox.max[0] - entry.bbox.min[0],
    entry.bbox.max[2] - entry.bbox.min[2],
  )
  return height >= 0.6 && width >= 0.6
}

function Batch({ part, placements, capacity, castShadow }: BatchProps) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const invalidate = useThree((s) => s.invalidate)
  const material = getSharedMaterials()[part.kind]

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    mesh.count = placements.length
    mesh.visible = placements.length > 0
    placements.forEach((p, i) => {
      temp.position.set(p.position[0], p.position[1], p.position[2])
      temp.rotation.set(0, p.rotY, 0)
      temp.scale.set(p.scale[0], p.scale[1], p.scale[2])
      temp.updateMatrix()
      mesh.setMatrixAt(i, temp.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [placements, invalidate])

  const solid = part.kind !== 'glass'
  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, material, capacity]}
      castShadow={castShadow}
      receiveShadow={solid}
      renderOrder={solid ? 0 : 2}
    />
  )
}

export interface InstancedModelsProps {
  name: string
  placements: readonly Placement[]
  /** Floors above this index are hidden (focus mode); `null` shows all. */
  activeFloorIndex: number | null
}

/**
 * Draws placements with one InstancedMesh per (model, node, material) for the
 * whole building (P06b R3). Models that are not loaded yet draw nothing.
 */
export function InstancedModels({ name, placements, activeFloorIndex }: InstancedModelsProps) {
  const version = useModelsVersion()

  const groups = useMemo(() => {
    const byKey = new Map<string, { model: string; node?: string; all: Placement[] }>()
    for (const p of placements) {
      const key = p.node ? `${p.model}#${p.node}` : p.model
      let group = byKey.get(key)
      if (!group) {
        group = { model: p.model, node: p.node, all: [] }
        byKey.set(key, group)
      }
      group.all.push(p)
    }
    return [...byKey.entries()]
  }, [placements])

  const batches = useMemo(() => {
    void version
    const out: Array<{
      key: string
      part: ModelPart
      visible: Placement[]
      capacity: number
      castShadow: boolean
    }> = []
    for (const [key, group] of groups) {
      const parts = getModelParts(group.model, group.node)
      if (!parts) continue
      const visible =
        activeFloorIndex === null
          ? group.all
          : group.all.filter((p) => p.floorIndex <= activeFloorIndex)
      const capacity = Math.max(8, Math.ceil(group.all.length / 8) * 8)
      const shadow = castsShadow(group.model)
      for (const part of parts) {
        out.push({
          key: `${key}:${part.kind}:${capacity}`,
          part,
          visible,
          capacity,
          castShadow: shadow && part.kind === 'palette',
        })
      }
    }
    return out
  }, [groups, activeFloorIndex, version])

  return (
    <group name={name}>
      {batches.map((b) => (
        <Batch
          key={b.key}
          part={b.part}
          placements={b.visible}
          capacity={b.capacity}
          castShadow={b.castShadow}
        />
      ))}
    </group>
  )
}

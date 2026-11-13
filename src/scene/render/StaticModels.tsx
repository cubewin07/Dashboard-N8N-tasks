import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getSharedMaterials } from './assets/materials'
import { getModelParts, isModelSettled, type MaterialKind } from './assets/modelStore'
import { tintedGeometry } from './assets/tint'
import type { Placement } from './assets/placements'
import { useModelsVersion } from './assets/useModels'
import { InstancedModels } from './InstancedModels'

const KINDS: readonly MaterialKind[] = ['palette', 'emissive', 'glass']
const temp = new THREE.Object3D()

interface MergedPart {
  kind: MaterialKind
  geometry: THREE.BufferGeometry
  /** Index count up to and including each floor index (floors are sorted). */
  endByFloor: number[]
}

function buildMerged(placements: readonly Placement[]): MergedPart[] {
  const sorted = [...placements].sort((a, b) => a.floorIndex - b.floorIndex)
  const maxFloor = sorted.reduce((m, p) => Math.max(m, p.floorIndex), 0)
  const out: MergedPart[] = []
  for (const kind of KINDS) {
    const pieces: THREE.BufferGeometry[] = []
    const endByFloor = new Array<number>(maxFloor + 1).fill(0)
    let total = 0
    for (const p of sorted) {
      const part = getModelParts(p.model, p.node, p.omit)?.find((x) => x.kind === kind)
      if (!part) continue
      temp.position.set(p.position[0], p.position[1], p.position[2])
      temp.rotation.set(0, p.rotY, 0)
      temp.scale.set(p.scale[0], p.scale[1], p.scale[2])
      temp.updateMatrix()
      pieces.push(tintedGeometry(part.geometry, p.tint).clone().applyMatrix4(temp.matrix))
      total += part.geometry.index?.count ?? 0
      endByFloor[p.floorIndex] = total
    }
    if (pieces.length === 0) continue
    for (let i = 1; i < endByFloor.length; i += 1) {
      endByFloor[i] = Math.max(endByFloor[i] ?? 0, endByFloor[i - 1] ?? 0)
    }
    const geometry = mergeGeometries(pieces, false)
    pieces.forEach((g) => g.dispose())
    if (geometry) out.push({ kind, geometry, endByFloor })
  }
  return out
}

function MergedMesh({
  part,
  activeFloorIndex,
}: {
  part: MergedPart
  activeFloorIndex: number | null
}) {
  const ref = useRef<THREE.Mesh>(null)
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    const last = part.endByFloor.length - 1
    const floor = activeFloorIndex === null ? last : Math.min(activeFloorIndex, last)
    part.geometry.setDrawRange(0, part.endByFloor[floor] ?? 0)
    invalidate()
  }, [part, activeFloorIndex, invalidate])
  useEffect(() => () => part.geometry.dispose(), [part])

  const solid = part.kind !== 'glass'
  return (
    <mesh
      ref={ref}
      geometry={part.geometry}
      material={getSharedMaterials()[part.kind]}
      castShadow={part.kind === 'palette'}
      receiveShadow={solid}
      renderOrder={solid ? 0 : 2}
    />
  )
}

export interface StaticModelsProps {
  name: string
  placements: readonly Placement[]
  /** Floors above this index are hidden (focus mode); `null` shows all. */
  activeFloorIndex: number | null
}

/**
 * Static scenery. While files are still arriving each model is instanced so it
 * can pop in on its own; once every file has settled the lot is baked into one
 * mesh per shared material (three draw calls), sorted by floor so focus mode
 * hides upper floors with a draw range.
 */
export function StaticModels({ name, placements, activeFloorIndex }: StaticModelsProps) {
  const version = useModelsVersion()

  const settled = useMemo(() => {
    void version
    return placements.length > 0 && placements.every((p) => isModelSettled(p.model))
  }, [placements, version])

  const merged = useMemo(() => (settled ? buildMerged(placements) : null), [settled, placements])

  if (!merged) {
    return (
      <InstancedModels name={name} placements={placements} activeFloorIndex={activeFloorIndex} />
    )
  }
  return (
    <group name={name}>
      {merged.map((part) => (
        <MergedMesh key={part.kind} part={part} activeFloorIndex={activeFloorIndex} />
      ))}
    </group>
  )
}

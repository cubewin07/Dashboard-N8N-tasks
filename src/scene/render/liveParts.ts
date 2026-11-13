import { useMemo } from 'react'
import * as THREE from 'three'
import type { BuildingLayout } from '@/scene/layout'
import { FURNITURE_MAP, type FurnitureLife } from './assets/furnitureMap'
import type { AssetManifest } from './assets/manifest'
import { isModelReady } from './assets/modelStore'
import { buildFurniturePlacements, type Placement } from './assets/placements'
import { useAssetManifest, useModelsVersion } from './assets/useModels'

/**
 * Shared bits for P05 visuals drawn with P06 model parts (P06b-T06): where
 * the furniture stands, and the matrices of a placement and its nodes.
 */

const EMPTY: readonly Placement[] = []
const cache = new WeakMap<BuildingLayout, { manifest: AssetManifest; placements: readonly Placement[] }>()

/** Furniture placements for a layout, built once per layout and manifest. */
export function furnitureFor(layout: BuildingLayout, manifest: AssetManifest | null): readonly Placement[] {
  if (!manifest) return EMPTY
  const hit = cache.get(layout)
  if (hit && hit.manifest === manifest) return hit.placements
  const placements = buildFurniturePlacements(layout, FURNITURE_MAP, manifest)
  cache.set(layout, { manifest, placements })
  return placements
}

export function useFurniture(layout: BuildingLayout): readonly Placement[] {
  const manifest = useAssetManifest()
  return useMemo(() => furnitureFor(layout, manifest), [layout, manifest])
}

/** The map's live-prop names, or `null` when the map has none. */
export const LIFE: FurnitureLife | null = FURNITURE_MAP.life ?? null

/** Bumps whenever any model finishes loading, and says if `model` is ready. */
export function useModelReady(model: string | null | undefined): boolean {
  const version = useModelsVersion()
  return useMemo(() => {
    void version
    return model ? isModelReady(model) : false
  }, [model, version])
}

const tmpPos = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
const tmpScale = new THREE.Vector3()
const Y_AXIS = new THREE.Vector3(0, 1, 0)

/** World matrix of a placement (model space → world). */
export function placementMatrix(p: Placement, out: THREE.Matrix4): THREE.Matrix4 {
  tmpPos.set(p.position[0], p.position[1], p.position[2])
  tmpQuat.setFromAxisAngle(Y_AXIS, p.rotY)
  tmpScale.set(p.scale[0], p.scale[1], p.scale[2])
  return out.compose(tmpPos, tmpQuat, tmpScale)
}

const tmpLocal = new THREE.Matrix4()

/**
 * World matrix of a node drawn pivot-relative: placement × translate(pivot) ×
 * rotation (Euler XYZ, radians) × optional local offset.
 */
export function nodeMatrix(
  p: Placement,
  pivot: readonly [number, number, number],
  rotation: THREE.Euler,
  out: THREE.Matrix4,
  offset?: THREE.Vector3,
): THREE.Matrix4 {
  placementMatrix(p, out)
  tmpPos.set(pivot[0], pivot[1], pivot[2])
  if (offset) tmpPos.add(offset)
  tmpQuat.setFromEuler(rotation)
  tmpLocal.compose(tmpPos, tmpQuat, tmpScale.set(1, 1, 1))
  return out.multiply(tmpLocal)
}

export const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0)

/** Marks an instanced mesh's matrices (and colours) for upload. */
export function flagInstances(mesh: THREE.InstancedMesh | null | undefined): void {
  if (!mesh) return
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

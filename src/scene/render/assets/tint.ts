import type * as THREE from 'three'
import { FURNITURE_MAP } from './furnitureMap'
import { remapCellUvs } from './paletteCells'

/**
 * Geometry recoloured for a department accent (R5): a clone whose UVs in the
 * map's `accentTint.from` cell point at `tint` instead. Cached per source
 * geometry and tint, so instancing and bakes share one copy.
 */
const cache = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry>>()

export function tintedGeometry(source: THREE.BufferGeometry, tint: string | undefined): THREE.BufferGeometry {
  const from = FURNITURE_MAP.accentTint?.from
  if (!tint || !from) return source
  let byTint = cache.get(source)
  if (!byTint) {
    byTint = new Map()
    cache.set(source, byTint)
  }
  const hit = byTint.get(tint)
  if (hit) return hit
  const uv = source.getAttribute('uv')
  if (!uv) return source
  const copy = source.clone()
  const moved = remapCellUvs(copy.getAttribute('uv') as THREE.BufferAttribute, from, tint)
  const out = moved > 0 ? copy : source
  if (out !== copy) copy.dispose()
  else (copy.getAttribute('uv') as THREE.BufferAttribute).needsUpdate = true
  byTint.set(tint, out)
  return out
}

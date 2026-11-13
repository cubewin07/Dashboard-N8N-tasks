import { useMemo } from 'react'
import type { BuildingLayout } from '@/scene/layout'
import { enrichBuildingLayout } from './floorArt'
import { FURNITURE_MAP } from './furnitureMap'
import type { AssetManifest } from './manifest'
import { useAssetManifest } from './useModels'

const cache = new WeakMap<BuildingLayout, { manifest: AssetManifest; art: BuildingLayout }>()

/** The layout enriched with art data, built once per layout and manifest. */
export function artLayoutFor(layout: BuildingLayout, manifest: AssetManifest | null): BuildingLayout {
  if (!manifest) return layout
  const hit = cache.get(layout)
  if (hit && hit.manifest === manifest) return hit.art
  const art = enrichBuildingLayout(layout, FURNITURE_MAP, manifest)
  cache.set(layout, { manifest, art })
  return art
}

/**
 * Enriches the building layout with art data (seats, piles, nav obstacles)
 * once manifest.json is loaded. Shared by every caller of the same layout.
 */
export function useArtLayout(layout: BuildingLayout): BuildingLayout {
  const manifest = useAssetManifest()
  return useMemo(() => artLayoutFor(layout, manifest), [layout, manifest])
}

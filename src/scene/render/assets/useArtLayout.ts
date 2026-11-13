import { useMemo } from 'react'
import type { BuildingLayout } from '@/scene/layout'
import { enrichBuildingLayout } from './floorArt'
import { FURNITURE_MAP } from './furnitureMap'
import { useAssetManifest } from './useModels'

/**
 * Enriches the building layout with art data (seats, piles, nav obstacles)
 * once manifest.json is loaded. Memoised by layout and manifest.
 */
export function useArtLayout(layout: BuildingLayout): BuildingLayout {
  const manifest = useAssetManifest()
  return useMemo(() => {
    if (!manifest) return layout
    return enrichBuildingLayout(layout, FURNITURE_MAP, manifest)
  }, [layout, manifest])
}

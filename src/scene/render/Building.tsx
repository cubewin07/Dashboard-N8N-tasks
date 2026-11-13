import { useEffect, useMemo, useState } from 'react'
import { floorSummary } from '@/domain/selectors'
import { useI18n } from '@/i18n'
import { useOfficeSelector } from '@/office/hooks'
import { useViewStore } from '@/scene/camera/viewStore'
import type { BuildingLayout } from '@/scene/layout'
import { FURNITURE_MAP, listMapModels } from './assets/furnitureMap'
import { orderModelLoads } from './assets/loadQueue'
import { isModelReady, requestModels } from './assets/modelStore'
import { buildFurniturePlacements, slotsWithModels } from './assets/placements'
import { buildShellPlacements } from './assets/shell'
import { useAssetManifest, useModelsVersion } from './assets/useModels'
import { Blockout } from './Blockout'
import { ElevatorShaft } from './ElevatorShaft'
import { Exterior } from './Exterior'
import { Floor } from './Floor'
import { buildFloorChips, type FloorLabelChip } from './FloorLabel'
import { decodeFloorSummaries, encodeFloorSummaries } from './floorSummaryKey'
import { Stairwell } from './Stairwell'
import { StaticModels } from './StaticModels'

export interface BuildingProps {
  layout: BuildingLayout
  reducedMotion?: boolean
}

const EMPTY: readonly never[] = []

export function Building({ layout, reducedMotion = false }: BuildingProps) {
  const mode = useViewStore((s) => s.mode)
  const focusedFloorKey = useViewStore((s) => s.focusedFloorKey)
  // Select a compact per-floor summary, not the whole state: the scene root
  // would otherwise re-render on every feed batch. Strings compare by value,
  // so it only re-renders when a chip's numbers change.
  const floorSummaryKey = useOfficeSelector((s) =>
    s ? encodeFloorSummaries(layout.floors.map((f) => floorSummary(s, f.key))) : '',
  )
  const { t } = useI18n()
  const manifest = useAssetManifest()
  const modelsVersion = useModelsVersion()

  const [initialFloorKeys] = useState(
    () => new Set(layout.floors.map((f) => f.key)),
  )

  const activeFloorIndex = useMemo(() => {
    if (mode !== 'floor' || !focusedFloorKey) return null
    const found = layout.floors.find((f) => f.key === focusedFloorKey)
    return found ? found.index : null
  }, [mode, focusedFloorKey, layout.floors])

  const floorChipsMap = useMemo(() => {
    const map = new Map<string, FloorLabelChip[]>()
    if (!floorSummaryKey) return map
    const labels = {
      chipWorking: t.office.chipWorking,
      chipWaiting: t.office.chipWaiting,
      chipReviewPile: t.office.chipReviewPile,
    }
    for (const summary of decodeFloorSummaries(floorSummaryKey)) {
      map.set(summary.floorKey, buildFloorChips(summary, labels))
    }
    return map
  }, [floorSummaryKey, t.office.chipWorking, t.office.chipWaiting, t.office.chipReviewPile])

  const shell = useMemo(
    () => (manifest ? buildShellPlacements(layout, FURNITURE_MAP.kit, manifest) : EMPTY),
    [layout, manifest],
  )
  const furniture = useMemo(
    () => (manifest ? buildFurniturePlacements(layout, FURNITURE_MAP, manifest) : EMPTY),
    [layout, manifest],
  )

  // Shell first, then the floor in view, then the rest bottom to top (P06b §3.4,
  // T12). A change of floor re-orders the files that have not started yet.
  const loadFocusKey = mode === 'floor' ? focusedFloorKey : null
  useEffect(() => {
    if (!manifest) return
    requestModels(
      orderModelLoads({
        kit: shell.map((p) => p.model),
        uses: furniture,
        focusedFloorKey: loadFocusKey,
        rest: listMapModels(FURNITURE_MAP),
      }),
    )
  }, [manifest, shell, furniture, loadFocusKey])

  const shellReady = useMemo(() => {
    void modelsVersion
    return shell.length > 0 && shell.every((p) => isModelReady(p.model))
  }, [shell, modelsVersion])

  const modelSlots = useMemo(() => {
    void modelsVersion
    return slotsWithModels(furniture, isModelReady)
  }, [furniture, modelsVersion])

  return (
    <group name="building-root">
      {layout.floors.map((floor) => {
        const isNewlyAdded = !initialFloorKeys.has(floor.key)
        return (
          <Floor
            key={floor.key}
            floor={floor}
            activeFloorIndex={activeFloorIndex}
            animateMount={isNewlyAdded}
            reducedMotion={reducedMotion}
            chips={floorChipsMap.get(floor.key)}
            blockoutWalls={!shellReady}
          />
        )
      })}
      <Blockout
        floors={layout.floors}
        activeFloorIndex={activeFloorIndex}
        skipSlots={modelSlots}
      />
      <StaticModels
        name="building-furniture"
        placements={furniture}
        activeFloorIndex={activeFloorIndex}
      />
      <Exterior layout={layout} showSign={activeFloorIndex === null} />
      {shellReady ? (
        <StaticModels
          name="building-shell"
          placements={shell}
          activeFloorIndex={activeFloorIndex}
        />
      ) : (
        <>
          <ElevatorShaft layout={layout} />
          <Stairwell layout={layout} />
        </>
      )}
    </group>
  )
}

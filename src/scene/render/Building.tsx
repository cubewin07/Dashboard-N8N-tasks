import { useMemo, useState } from 'react'
import { floorSummary } from '@/domain/selectors'
import { useI18n } from '@/i18n'
import { useOfficeSelector } from '@/office/hooks'
import { useViewStore } from '@/scene/camera/viewStore'
import type { BuildingLayout } from '@/scene/layout'
import { Blockout } from './Blockout'
import { ElevatorShaft } from './ElevatorShaft'
import { Floor } from './Floor'
import { buildFloorChips, type FloorLabelChip } from './FloorLabel'
import { Stairwell } from './Stairwell'

export interface BuildingProps {
  layout: BuildingLayout
  reducedMotion?: boolean
}

export function Building({ layout, reducedMotion = false }: BuildingProps) {
  const mode = useViewStore((s) => s.mode)
  const focusedFloorKey = useViewStore((s) => s.focusedFloorKey)
  const state = useOfficeSelector((s) => s)
  const { t } = useI18n()

  const [initialFloorKeys] = useState(
    () => new Set(layout.floors.map((f) => f.key)),
  )

  const activeFloorIndex = useMemo(() => {
    if (mode !== 'floor' || !focusedFloorKey) return null
    const found = layout.floors.find((f) => f.key === focusedFloorKey)
    return found ? found.index : null
  }, [mode, focusedFloorKey, layout.floors])

  const floorChipsMap = useMemo(() => {
    if (!state) return new Map<string, FloorLabelChip[]>()
    const labels = {
      chipWorking: t.office.chipWorking,
      chipWaiting: t.office.chipWaiting,
      chipReviewPile: t.office.chipReviewPile,
    }
    const map = new Map<string, FloorLabelChip[]>()
    for (const floor of layout.floors) {
      const summary = floorSummary(state, floor.key)
      map.set(floor.key, buildFloorChips(summary, labels))
    }
    return map
  }, [state, layout.floors, t.office.chipWorking, t.office.chipWaiting, t.office.chipReviewPile])

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
          />
        )
      })}
      <Blockout floors={layout.floors} activeFloorIndex={activeFloorIndex} />
      <ElevatorShaft layout={layout} />
      <Stairwell layout={layout} />
    </group>
  )
}

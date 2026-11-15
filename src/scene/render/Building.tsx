import { useMemo, useState } from 'react'
import { useViewStore } from '@/scene/camera/viewStore'
import type { BuildingLayout } from '@/scene/layout'
import { Blockout } from './Blockout'
import { ElevatorShaft } from './ElevatorShaft'
import { Floor } from './Floor'
import { Stairwell } from './Stairwell'

export interface BuildingProps {
  layout: BuildingLayout
  reducedMotion?: boolean
}

export function Building({ layout, reducedMotion = false }: BuildingProps) {
  const mode = useViewStore((s) => s.mode)
  const focusedFloorKey = useViewStore((s) => s.focusedFloorKey)

  const [initialFloorKeys] = useState(
    () => new Set(layout.floors.map((f) => f.key)),
  )

  const activeFloorIndex = useMemo(() => {
    if (mode !== 'floor' || !focusedFloorKey) return null
    const found = layout.floors.find((f) => f.key === focusedFloorKey)
    return found ? found.index : null
  }, [mode, focusedFloorKey, layout.floors])

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
          />
        )
      })}
      <Blockout floors={layout.floors} activeFloorIndex={activeFloorIndex} />
      <ElevatorShaft layout={layout} />
      <Stairwell layout={layout} />
    </group>
  )
}

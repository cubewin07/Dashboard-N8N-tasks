import type { BuildingLayout } from '@/scene/layout'
import { Aquarium } from './Aquarium'
import { Cat } from './Cat'
import { DayNight } from './DayNight'
import { Decor } from './Decor'
import { DeskStatus } from './DeskStatus'
import { DocPiles } from './DocPiles'
import { Fans } from './Fans'
import { WallClock } from './WallClock'

export interface OfficeLifeProps {
  layout: BuildingLayout
  reducedMotion?: boolean
}

/**
 * P05 floor-level life: desk status, paper piles and decorative life.
 * Every layer is instanced or merged and updates imperatively in
 * `useFrame`; nothing here sets React state per frame. Small props hide
 * on cut-away floors, like people do.
 */
export function OfficeLife({ layout, reducedMotion = false }: OfficeLifeProps) {
  return (
    <group name="office-life">
      <DeskStatus layout={layout} />
      <DocPiles layout={layout} />
      <Decor layout={layout} />
      <WallClock layout={layout} />
      <Fans layout={layout} reducedMotion={reducedMotion} />
      <Aquarium layout={layout} reducedMotion={reducedMotion} />
      <Cat layout={layout} reducedMotion={reducedMotion} />
      <DayNight reducedMotion={reducedMotion} />
    </group>
  )
}

import type { BuildingLayout } from '@/scene/layout'
import { DocPiles } from './DocPiles'

export interface OfficeLifeProps {
  layout: BuildingLayout
  reducedMotion?: boolean
}

/**
 * P05 floor-level life: desk status, paper piles and decorative life.
 * Every layer is instanced or merged and updates imperatively in
 * `useFrame`; nothing here sets React state per frame.
 */
export function OfficeLife({ layout }: OfficeLifeProps) {
  return (
    <group name="office-life">
      <DocPiles layout={layout} />
    </group>
  )
}

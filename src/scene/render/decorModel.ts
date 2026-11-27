import type { Slot } from '@/domain/config'

/**
 * What a `decor` slot is. Templates use the one slot type for plants and
 * for fixed props; the slot id names the prop (`decor_plant_1`,
 * `reception_desk`, `task_wall`). Anything unrecognised is a plant.
 */
export type DecorKind = 'plant' | 'counter' | 'board'

export function decorKind(slot: Pick<Slot, 'id' | 'type'>): DecorKind | null {
  if (slot.type !== 'decor') return null
  const id = slot.id.toLowerCase()
  if (id.includes('plant')) return 'plant'
  if (id.includes('desk') || id.includes('counter')) return 'counter'
  if (id.includes('wall') || id.includes('board')) return 'board'
  return 'plant'
}

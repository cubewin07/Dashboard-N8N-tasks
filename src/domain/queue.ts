import type { Policy } from './config'
import type { Iso, Priority } from './primitives'

export interface QueueableItem {
  id: string
  priority: Priority
  createdAt: Iso
}

const MS_PER_HOUR = 3_600_000

export function effectivePriority(
  item: Pick<QueueableItem, 'priority' | 'createdAt'>,
  now: Iso,
  policy: Policy,
): number {
  const nowMs = Date.parse(now)
  const createdMs = Date.parse(item.createdAt)
  const hoursWaiting = Math.max(0, (nowMs - createdMs) / MS_PER_HOUR)
  const agingPoints = Math.min(
    policy.priority.agingCapPoints,
    policy.priority.agingPointsPerHour * hoursWaiting,
  )
  return policy.priority.weights[item.priority] + agingPoints
}

export function sortQueue<T extends QueueableItem>(
  items: readonly T[],
  now: Iso,
  policy: Policy,
): T[] {
  if (items.length <= 1) {
    return [...items]
  }

  const nowMs = Date.parse(now)
  const weights = policy.priority.weights
  const agingRate = policy.priority.agingPointsPerHour
  const agingCap = policy.priority.agingCapPoints

  const decorated = items.map((item) => {
    const createdMs = Date.parse(item.createdAt)
    const hoursWaiting = Math.max(0, (nowMs - createdMs) / MS_PER_HOUR)
    const aging = Math.min(agingCap, agingRate * hoursWaiting)
    const score = weights[item.priority] + aging
    return {
      item,
      score,
      createdMs,
      id: item.id,
    }
  })

  decorated.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    if (a.createdMs !== b.createdMs) {
      return a.createdMs - b.createdMs
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  return decorated.map((d) => d.item)
}

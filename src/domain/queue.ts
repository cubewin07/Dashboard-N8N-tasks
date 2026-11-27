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

  const n = items.length
  const nowMs = Date.parse(now)
  const weights = policy.priority.weights
  const agingRate = policy.priority.agingPointsPerHour
  const agingCap = policy.priority.agingCapPoints

  const decorated = new Array(n)
  for (let i = 0; i < n; i += 1) {
    const item = items[i]!
    const createdMs = Date.parse(item.createdAt)
    const hoursWaiting = (nowMs - createdMs) / MS_PER_HOUR
    const aging =
      hoursWaiting <= 0
        ? 0
        : agingRate * hoursWaiting > agingCap
          ? agingCap
          : agingRate * hoursWaiting
    decorated[i] = {
      item,
      score: weights[item.priority] + aging,
      createdMs,
      id: item.id,
    }
  }

  decorated.sort((a, b) => {
    const scoreDiff = b.score - a.score
    if (scoreDiff !== 0) return scoreDiff
    const timeDiff = a.createdMs - b.createdMs
    if (timeDiff !== 0) return timeDiff
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const result = new Array(n)
  for (let i = 0; i < n; i += 1) {
    result[i] = decorated[i]!.item
  }
  return result
}

import type { FloorSummary } from '@/domain/selectors'

/**
 * A floor's chip numbers as one string. Selecting this instead of the whole
 * office state means the scene root re-renders only when a chip changes.
 */
export function encodeFloorSummaries(list: readonly FloorSummary[]): string {
  return list
    .map((x) => [x.floorKey, x.working, x.waiting, x.reviewPile, x.idle, x.headcount].join('|'))
    .join(';')
}

export function decodeFloorSummaries(key: string): FloorSummary[] {
  if (!key) return []
  return key.split(';').map((row) => {
    const [floorKey, working, waiting, reviewPile, idle, headcount] = row.split('|')
    return {
      floorKey: floorKey!,
      working: Number(working),
      waiting: Number(waiting),
      reviewPile: Number(reviewPile),
      idle: Number(idle),
      headcount: Number(headcount),
    }
  })
}

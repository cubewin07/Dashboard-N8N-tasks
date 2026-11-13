/**
 * Order in which model files are fetched (P06b-T12). Pure: names in, names out.
 *
 * 1. the building kit (walls, stairs, lift), so the shell stands first;
 * 2. everything used on the focused floor, in placement order;
 * 3. the other floors, bottom to top;
 * 4. whatever is left (street props, models no floor uses right now).
 *
 * Each name appears once, at its earliest position.
 */
export interface ModelUse {
  model: string
  floorKey: string
  /** 0 is the ground floor. */
  floorIndex: number
}

export interface LoadQueueInput {
  kit: readonly string[]
  uses: readonly ModelUse[]
  /** Floor the camera is on, or `null` when the whole building is in view. */
  focusedFloorKey: string | null
  rest?: readonly string[]
}

export function orderModelLoads({
  kit,
  uses,
  focusedFloorKey,
  rest = [],
}: LoadQueueInput): string[] {
  const out = new Set<string>(kit)
  if (focusedFloorKey !== null) {
    for (const use of uses) {
      if (use.floorKey === focusedFloorKey) out.add(use.model)
    }
  }
  // Array.prototype.sort is stable: uses on one floor keep their given order.
  const bottomUp = [...uses].sort((a, b) => a.floorIndex - b.floorIndex)
  for (const use of bottomUp) out.add(use.model)
  for (const name of rest) out.add(name)
  return [...out]
}

/**
 * Re-order names that are still waiting so they follow `order`. Names the
 * order does not mention keep their relative order, after the ones it does.
 */
export function reprioritise(pending: readonly string[], order: readonly string[]): string[] {
  const rank = new Map<string, number>()
  order.forEach((name, i) => {
    if (!rank.has(name)) rank.set(name, i)
  })
  const last = order.length
  return [...pending].sort((a, b) => (rank.get(a) ?? last) - (rank.get(b) ?? last))
}

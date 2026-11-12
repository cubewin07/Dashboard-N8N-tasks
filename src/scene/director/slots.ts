import type { EmployeeId } from '@/domain/primitives'

/**
 * Who holds which shared spot (waiting seats, idle spots, tables). Desks are
 * not here: the layout's seat allocation owns those. No two people ever hold
 * the same place of a slot.
 */
export class SlotLedger {
  private readonly holders = new Map<string, Array<EmployeeId | null>>()
  private readonly byPerson = new Map<EmployeeId, Set<string>>()

  static key(floorKey: string, slotId: string): string {
    return `${floorKey}::${slotId}`
  }

  /**
   * Take a place. Returns the place index (0-based) or -1 when full.
   * Idempotent: the same person keeps the place they already have.
   */
  reserve(key: string, id: EmployeeId, capacity = 1): number {
    let places = this.holders.get(key)
    if (!places) {
      places = []
      this.holders.set(key, places)
    }
    const existing = places.indexOf(id)
    if (existing >= 0) return existing
    for (let i = 0; i < capacity; i += 1) {
      if (places[i] === undefined || places[i] === null) {
        places[i] = id
        let mine = this.byPerson.get(id)
        if (!mine) {
          mine = new Set()
          this.byPerson.set(id, mine)
        }
        mine.add(key)
        return i
      }
    }
    return -1
  }

  placeOf(key: string, id: EmployeeId): number {
    return this.holders.get(key)?.indexOf(id) ?? -1
  }

  isFree(key: string, capacity = 1): boolean {
    const places = this.holders.get(key)
    if (!places) return true
    for (let i = 0; i < capacity; i += 1) {
      if (places[i] === undefined || places[i] === null) return true
    }
    return false
  }

  occupancy(key: string): number {
    const places = this.holders.get(key)
    if (!places) return 0
    let n = 0
    for (const p of places) if (p) n += 1
    return n
  }

  release(key: string, id: EmployeeId): void {
    const places = this.holders.get(key)
    if (places) {
      const idx = places.indexOf(id)
      if (idx >= 0) places[idx] = null
    }
    this.byPerson.get(id)?.delete(key)
  }

  /** Free everything the person holds, except `keepKey`. */
  releaseAll(id: EmployeeId, keepKey: string | null = null): void {
    const mine = this.byPerson.get(id)
    if (!mine) return
    for (const key of [...mine]) {
      if (key !== keepKey) this.release(key, id)
    }
  }

  heldBy(id: EmployeeId): readonly string[] {
    return [...(this.byPerson.get(id) ?? [])]
  }

  clear(): void {
    this.holders.clear()
    this.byPerson.clear()
  }
}

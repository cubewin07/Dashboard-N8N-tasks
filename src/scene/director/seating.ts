import type { Slot, SlotType } from '@/domain/config'
import type { FloorLayout } from '@/scene/layout'
import type { NavGrid, Vec2 } from '@/scene/nav/types'
import { approachOf, stationFor } from './stations'
import type { Station } from './types'

/**
 * P05 §3.4 (R5): waiting seats and the standing line, pure.
 *
 * People asking face to face sit on the floor's `waiting_seat` slots in order
 * of arrival; when the bench is full they stand in a line behind it, 0.6 m
 * apart. When somebody leaves, the seated keep their seats and the head of
 * the line takes the freed one: nobody is reshuffled.
 */

export const LINE_SPACING = 0.6

export interface SeatPlace {
  id: string
  /** 0-based place in arrival order (the drawer shows index + 1). */
  index: number
  seated: boolean
  /** Seat number on the bench, or -1 while standing. */
  seat: number
  /** Place in the standing line (0 = first behind the bench), or -1 while seated. */
  line: number
}

/**
 * Seats for a queue that starts empty: arrival `i < capacity` → seat i, the
 * rest stand in line at `capacity + k`.
 */
export function seatFor(waiting: readonly string[], capacity: number): SeatPlace[] {
  return allocateSeats(waiting, capacity, new Map())
}

/**
 * Seats for the current queue (`waiting` in arrival order), keeping whoever
 * already sits (`previous`: id → seat). Freed seats go to the line in order,
 * lowest seat number first.
 */
export function allocateSeats(
  waiting: readonly string[],
  capacity: number,
  previous: ReadonlyMap<string, number>,
): SeatPlace[] {
  const cap = Math.max(0, Math.floor(capacity))
  const taken: Array<string | null> = new Array<string | null>(cap).fill(null)
  const seatOf = new Map<string, number>()
  for (const id of waiting) {
    const seat = previous.get(id)
    if (seat === undefined || seat < 0 || seat >= cap || taken[seat] !== null) continue
    taken[seat] = id
    seatOf.set(id, seat)
  }
  let line = 0
  return waiting.map((id, index) => {
    let seat = seatOf.get(id)
    if (seat === undefined) {
      const free = taken.indexOf(null)
      if (free >= 0) {
        taken[free] = id
        seat = free
        seatOf.set(id, free)
      }
    }
    if (seat !== undefined) return { id, index, seated: true, seat, line: -1 }
    const place: SeatPlace = { id, index, seated: false, seat: -1, line }
    line += 1
    return place
  })
}

/** Standing place `k` of a line that starts at `origin` and runs along `dir` (unit). */
export function linePoint(origin: Vec2, dir: Vec2, k: number, spacing = LINE_SPACING): Vec2 {
  const d = spacing * (k + 1)
  return { x: origin.x + dir.x * d, z: origin.z + dir.z * d }
}

export interface Bench {
  /** Seat stations, nearest to the floor's room first. */
  seats: Station[]
  /** The line starts at the last seat's approach and continues along the bench. */
  origin: Vec2
  dir: Vec2
}

/** Rooms people queue for, in the order they claim a floor's bench. */
const ROOM_TYPES: readonly SlotType[] = ['boss_desk', 'manager_office', 'private_office', 'review_desk']

function roomOf(floor: FloorLayout): Slot | null {
  for (const type of ROOM_TYPES) {
    const slot = floor.slots.find((s) => s.type === type)
    if (slot) return slot
  }
  return null
}

const benchCache = new WeakMap<FloorLayout, Bench | null>()

/**
 * The floor's waiting bench: its `waiting_seat` slots ordered by distance to
 * the room (ties by id) and the direction the standing line grows. null when
 * the floor has no waiting seats.
 */
export function benchOf(floor: FloorLayout): Bench | null {
  if (benchCache.has(floor)) return benchCache.get(floor) ?? null
  const room = roomOf(floor)
  const slots = floor.slots.filter((s) => s.type === 'waiting_seat')
  let bench: Bench | null = null
  if (slots.length > 0) {
    const anchor: Vec2 = room ? { x: room.x, z: room.z } : { x: slots[0]!.x, z: slots[0]!.z }
    const dist = (s: Slot) => Math.hypot(s.x - anchor.x, s.z - anchor.z)
    slots.sort((a, b) => dist(a) - dist(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const seats = slots.map((s) => stationFor(floor, s))
    const first = approachOf(slots[0]!)
    const last = approachOf(slots[slots.length - 1]!)
    let dx = last.x - first.x
    let dz = last.z - first.z
    let len = Math.hypot(dx, dz)
    if (len < 1e-6) {
      // One seat: the line runs sideways from it.
      const s = slots[0]!
      dx = Math.cos(s.rotY)
      dz = -Math.sin(s.rotY)
      len = 1
    }
    bench = { seats, origin: last, dir: { x: dx / len, z: dz / len } }
  }
  benchCache.set(floor, bench)
  return bench
}

/** The free cell nearest to `p` (p itself when free), searching up to `rings` cells out. */
export function nearestFree(grid: NavGrid, p: Vec2, rings = 4): Vec2 {
  const [col, row] = grid.toCell(p)
  if (!grid.isBlocked(col, row)) return p
  let best: Vec2 | null = null
  let bestD = Infinity
  for (let r = 1; r <= rings && !best; r += 1) {
    for (let dr = -r; dr <= r; dr += 1) {
      for (let dc = -r; dc <= r; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue
        if (grid.isBlocked(col + dc, row + dr)) continue
        const q = grid.toWorld(col + dc, row + dr)
        const d = Math.hypot(q.x - p.x, q.z - p.z)
        if (d < bestD) {
          bestD = d
          best = q
        }
      }
    }
  }
  return best ?? p
}

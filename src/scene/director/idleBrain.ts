import type { Slot, SlotType } from '@/domain/config'
import type { EmployeeId } from '@/domain/primitives'
import type { PersonActivity } from '@/domain/work'
import type { BuildingLayout, FloorLayout } from '@/scene/layout'
import type { Intent } from './intents'
import type { Rng } from './rng'
import { SlotLedger } from './slots'
import { TUNING } from './tuning'

const IDLE_SLOT_TYPES: ReadonlySet<SlotType> = new Set([
  'idle_sofa',
  'idle_coffee',
  'idle_tea_table',
  'idle_water',
  'idle_window',
  'idle_chat',
  'idle_pingpong',
  'idle_arcade',
  'idle_boardgame',
  'idle_karaoke',
  'idle_bed',
  'idle_massage_chair',
])

const SLEEP_SLOT_ORDER: readonly SlotType[] = ['idle_bed', 'idle_massage_chair', 'idle_sofa']

export function isIdleSlot(slot: Slot): boolean {
  return IDLE_SLOT_TYPES.has(slot.type)
}

export function isLeisureFloor(floor: FloorLayout): boolean {
  return floor.kind === 'lobby_cafe' || floor.kind === 'games_rest'
}

export interface IdleContext {
  layout: BuildingLayout
  ledger: SlotLedger
  rng: Rng
  /** Floor of the person's own desk. */
  homeFloorIndex: number
  /** Share (0..1) of this person's department that is on a leisure floor right now. */
  deptAwayShare: number
}

export interface IdleChoice {
  /** null → stay at the desk. */
  intent: Intent | null
  dwellSimMinutes: number
}

function freeSlots(floor: FloorLayout, ledger: SlotLedger, accept: (slot: Slot) => boolean): Slot[] {
  const out: Slot[] = []
  for (const slot of floor.slots) {
    if (!accept(slot)) continue
    if (ledger.isFree(SlotLedger.key(floor.key, slot.id), slot.capacity ?? 1)) out.push(slot)
  }
  return out
}

function pickAndReserve(
  id: EmployeeId,
  candidates: ReadonlyArray<{ floor: FloorLayout; slot: Slot }>,
  ctx: IdleContext,
): { floor: FloorLayout; slot: Slot } | null {
  if (candidates.length === 0) return null
  const start = Math.min(candidates.length - 1, Math.floor(ctx.rng() * candidates.length))
  for (let i = 0; i < candidates.length; i += 1) {
    const cand = candidates[(start + i) % candidates.length]!
    const key = SlotLedger.key(cand.floor.key, cand.slot.id)
    if (ctx.ledger.reserve(key, id, cand.slot.capacity ?? 1) >= 0) return cand
  }
  return null
}

function dwell(rng: Rng): number {
  const [lo, hi] = TUNING.idle.dwellSimMinutes
  return lo + rng() * (hi - lo)
}

/**
 * P04 idle brain (§3.3): at each dwell end pick, with seeded weights, between
 * staying at the desk, an idle spot on the own floor, and a leisure floor
 * (reached by the stairs). The chosen spot is reserved in the ledger here, so
 * two people deciding in the same tick never get the same place.
 */
export function chooseIdleIntent(id: EmployeeId, ctx: IdleContext): IdleChoice {
  const { stayAtDesk, wander } = TUNING.idle
  const roll = ctx.rng()
  const dwellSimMinutes = dwell(ctx.rng)
  const home = ctx.layout.floors[ctx.homeFloorIndex]

  if (roll < stayAtDesk || !home) {
    return { intent: null, dwellSimMinutes }
  }

  const wantsLeisure = roll >= stayAtDesk + wander
  if (wantsLeisure && ctx.deptAwayShare < TUNING.idle.maxDeptAwayShare) {
    const candidates: Array<{ floor: FloorLayout; slot: Slot }> = []
    for (const floor of ctx.layout.floors) {
      if (!isLeisureFloor(floor) || floor.index === home.index) continue
      for (const slot of freeSlots(floor, ctx.ledger, isIdleSlot)) candidates.push({ floor, slot })
    }
    const got = pickAndReserve(id, candidates, ctx)
    if (got) {
      return {
        intent: { kind: 'RestOnLeisureFloor', floorKey: got.floor.key, slotId: got.slot.id },
        dwellSimMinutes,
      }
    }
  }

  const local = freeSlots(home, ctx.ledger, isIdleSlot).map((slot) => ({ floor: home, slot }))
  const got = pickAndReserve(id, local, ctx)
  if (got) {
    return {
      intent: { kind: 'IdleWander', floorKey: got.floor.key, slotId: got.slot.id },
      // A walk to the water cooler is shorter than a trip to the café.
      dwellSimMinutes: dwellSimMinutes * 0.5,
    }
  }
  return { intent: null, dwellSimMinutes }
}

/**
 * Lunch and night: a place on a leisure floor (beds first at night). null →
 * no free place, nap at the desk. AI employees never go home.
 */
export function chooseRestIntent(
  id: EmployeeId,
  activity: PersonActivity,
  ctx: IdleContext,
): Intent | null {
  const leisureFloors = ctx.layout.floors.filter(isLeisureFloor)
  if (activity === 'off_shift') {
    for (const type of SLEEP_SLOT_ORDER) {
      const candidates: Array<{ floor: FloorLayout; slot: Slot }> = []
      for (const floor of leisureFloors) {
        if (floor.kind !== 'games_rest') continue
        for (const slot of freeSlots(floor, ctx.ledger, (s) => s.type === type)) {
          candidates.push({ floor, slot })
        }
      }
      const got = pickAndReserve(id, candidates, ctx)
      if (got) return { kind: 'RestOnLeisureFloor', floorKey: got.floor.key, slotId: got.slot.id }
    }
    return null
  }
  const candidates: Array<{ floor: FloorLayout; slot: Slot }> = []
  for (const floor of leisureFloors) {
    for (const slot of freeSlots(floor, ctx.ledger, isIdleSlot)) candidates.push({ floor, slot })
  }
  const got = pickAndReserve(id, candidates, ctx)
  return got ? { kind: 'RestOnLeisureFloor', floorKey: got.floor.key, slotId: got.slot.id } : null
}

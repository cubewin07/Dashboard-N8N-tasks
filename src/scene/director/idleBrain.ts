import type { Policy, Slot, SlotType } from '@/domain/config'
import type { EmployeeId } from '@/domain/primitives'
import type { EmoteKey, IdleBehaviours, IdleOption } from '@/domain/visual'
import type { PersonActivity } from '@/domain/work'
import type { BuildingLayout, FloorLayout } from '@/scene/layout'
import type { Vec2 } from '@/scene/nav/types'
import type { Intent } from './intents'
import { toPoseKey, type PoseKey } from './poses'
import { makeRng, type Rng } from './rng'
import { SlotLedger } from './slots'
import { approachOf, stationFor } from './stations'
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
 * P04 idle brain (§3.3), kept as the fallback when the director gets no
 * `IdleBehaviours` (P05 brain: `chooseIdle` below): at each dwell end pick, with seeded weights, between
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

// ═════════════════════════════ P05 idle brain (§3.3) ═════════════════════════════

/** `policy.calendar.timezone` is fixed to Asia/Ho_Chi_Minh (UTC+7, no DST). */
const ICT_OFFSET_MINUTES = 7 * 60

export interface IdleClock {
  /** Sim time, ms since the epoch. */
  simMs: number
  /** Local (ICT) minutes since midnight. */
  minutesOfDay: number
  lunch: boolean
  /** Outside office hours (or Sunday) for office departments. */
  night: boolean
}

function hhmm(text: string): number {
  const [h, m] = text.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function inWindow(minutes: number, [from, to]: readonly [string, string]): boolean {
  const a = hhmm(from)
  const b = hhmm(to)
  return a <= b ? minutes >= a && minutes < b : minutes >= a || minutes < b
}

/** Lunch / night from the feed clock and `policy.calendar` (same rules as the simulator's shifts). */
export function idleClock(simMs: number, calendar: Policy['calendar']): IdleClock {
  const localMs = simMs + ICT_OFFSET_MINUTES * 60_000
  const minutesOfDay = Math.floor((((localMs / 60_000) % 1440) + 1440) % 1440)
  const dayOfWeek = new Date(localMs).getUTCDay()
  const work = inWindow(minutesOfDay, [calendar.workStart, calendar.workEnd]) && dayOfWeek !== 0
  return {
    simMs,
    minutesOfDay,
    lunch: inWindow(minutesOfDay, calendar.lunch),
    night: !work,
  }
}

/** Which calendar phase the clock is in (a change re-plans everybody's idle time). */
export function calendarPhase(clock: IdleClock): 'lunch' | 'night' | 'day' {
  return clock.lunch ? 'lunch' : clock.night ? 'night' : 'day'
}

export function idleEpoch(simMs: number, epochMinutes: number): number {
  return Math.floor(simMs / 60_000 / Math.max(1, epochMinutes))
}

export interface IdlePerson {
  id: EmployeeId
  homeFloorIndex: number
  currentFloorIndex: number
  /** Floor-local position now. */
  pos: Vec2
  /** Last option keys, newest last (the novelty penalty looks at 3). */
  history: readonly string[]
  /** The department works around the clock: shift workers stay at their desks at night. */
  is247: boolean
  /** Owners only take small seated idles at the boss desk. */
  owner: boolean
  /** Share (0..1) of the department already on a leisure floor (counting this person). */
  deptAwayShare: number
}

export interface IdlePartner {
  id: EmployeeId
  floorIndex: number
}

export interface IdleWorld {
  config: IdleBehaviours
  layout: BuildingLayout
  ledger: SlotLedger
  seed: string
  clock: IdleClock
  /** Idle people free to be invited (settled, not paired), sorted by id. Never includes the chooser. */
  partners: readonly IdlePartner[]
}

export interface IdleDecision {
  key: string
  intent: Intent
  emote: EmoteKey | null
  dwellSimMinutes: number
  /** The invited partner of a pair option; their place on the spot is reserved too. */
  partnerId: EmployeeId | null
  /** Settled pose (the option's `anim`). */
  pose: PoseKey
  /** The spot (null = at the own desk). */
  spot: { floorIndex: number; floorKey: string; slotId: string } | null
}

/** The intent for somebody whose desk is on `homeFloorIndex` going to a spot. */
export function spotIntent(
  homeFloorIndex: number,
  spot: NonNullable<IdleDecision['spot']>,
  pose: PoseKey,
): Intent {
  return spot.floorIndex === homeFloorIndex
    ? { kind: 'IdleWander', floorKey: spot.floorKey, slotId: spot.slotId, pose }
    : { kind: 'RestOnLeisureFloor', floorKey: spot.floorKey, slotId: spot.slotId, pose }
}

export interface ScoredOption {
  option: IdleOption
  score: number
  floor: FloorLayout | null
  slot: Slot | null
  partner: IdlePartner | null
}

const SAME_FLOOR_DISTANCE_SCALE = 25

function isCalendarOption(o: IdleOption): boolean {
  return Boolean(o.when?.lunch || o.when?.night)
}

/** 1 when the option fits the time (and the person), else 0. */
export function timeFit(o: IdleOption, person: IdlePerson, clock: IdleClock): number {
  const when = o.when
  if (when?.lunch && !clock.lunch) return 0
  if (when?.night && (!clock.night || person.is247)) return 0
  if (when?.hours && !inWindow(clock.minutesOfDay, when.hours)) return 0
  // Night shift of a 24/7 department: on duty, idle at the desk only.
  if (clock.night && person.is247 && o.slotTypes.length > 0) return 0
  return 1
}

/** Places an option may use at a slot (pairs fit at a one-person spot). */
export function placesFor(o: IdleOption, slot: Slot): number {
  return Math.min(o.maxPeople, Math.max(slot.capacity ?? 1, o.minPeople))
}

function floorsFor(o: IdleOption, person: IdlePerson, layout: BuildingLayout, awayAllowed: boolean): FloorLayout[] {
  const home = layout.floors[person.homeFloorIndex]
  const out: FloorLayout[] = []
  if (home && (o.floors === 'own' || o.floors === 'any')) out.push(home)
  if (o.floors === 'leisure' || o.floors === 'any') {
    for (const floor of layout.floors) {
      if (!isLeisureFloor(floor) || floor.index === person.homeFloorIndex) continue
      if (!awayAllowed) continue
      out.push(floor)
    }
  }
  return out
}

/**
 * Score every option for one person (§3.3): weight × timeFit ×
 * noveltyPenalty(last 3) × distance / other-floor penalty × slotFree.
 * Calendar options (lunch, night) are exempt from novelty and from the
 * department away cap, and fall back to a nap at the desk when no bed or sofa
 * is free. Sorted by score, then key.
 */
export function scoreIdleOptions(person: IdlePerson, world: IdleWorld): ScoredOption[] {
  const { config, layout, ledger, clock } = world
  const recent = person.history.slice(-3)
  const out: ScoredOption[] = []
  for (const o of config.options) {
    const fit = timeFit(o, person, clock)
    if (fit <= 0 || o.weight <= 0) continue
    const calendar = isCalendarOption(o)
    const novelty = !calendar && recent.includes(o.key) ? config.noveltyPenalty : 1
    const base = o.weight * fit * novelty

    if (o.slotTypes.length === 0) {
      if (o.minPeople > 1) continue
      const away = person.currentFloorIndex !== person.homeFloorIndex ? config.otherFloorPenalty : 1
      out.push({ option: o, score: base * away, floor: null, slot: null, partner: null })
      continue
    }

    let best: { score: number; floor: FloorLayout; slot: Slot; partner: IdlePartner | null } | null = null
    if (!person.owner) {
      const awayAllowed = calendar || person.deptAwayShare < config.maxDeptAwayShare
      const types = new Set(o.slotTypes)
      for (const floor of floorsFor(o, person, layout, awayAllowed)) {
        for (const slot of floor.slots) {
          if (!types.has(slot.type)) continue
          const key = SlotLedger.key(floor.key, slot.id)
          const free = placesFor(o, slot) - ledger.occupancy(key)
          if (free < o.minPeople) continue
          let partner: IdlePartner | null = null
          if (o.minPeople > 1) {
            partner =
              world.partners.find(
                (p) => p.floorIndex === person.currentFloorIndex || p.floorIndex === floor.index,
              ) ?? null
            if (!partner) continue
          }
          let factor: number
          if (floor.index === person.currentFloorIndex) {
            const a = approachOf(slot)
            factor = 1 / (1 + Math.hypot(a.x - person.pos.x, a.z - person.pos.z) / SAME_FLOOR_DISTANCE_SCALE)
          } else {
            factor = config.otherFloorPenalty
          }
          if (
            !best ||
            factor > best.score + 1e-9 ||
            (Math.abs(factor - best.score) <= 1e-9 &&
              (floor.index < best.floor.index || (floor.index === best.floor.index && slot.id < best.slot.id)))
          ) {
            best = { score: factor, floor, slot, partner }
          }
        }
      }
    }
    if (best) {
      out.push({ option: o, score: base * best.score, floor: best.floor, slot: best.slot, partner: best.partner })
    } else if (calendar && o.minPeople === 1) {
      // No bed or sofa free (or an owner): nap at the desk.
      const away = person.currentFloorIndex !== person.homeFloorIndex ? config.otherFloorPenalty : 1
      out.push({ option: o, score: base * away, floor: null, slot: null, partner: null })
    }
  }
  out.sort((a, b) => b.score - a.score || (a.option.key < b.option.key ? -1 : a.option.key > b.option.key ? 1 : 0))
  return out
}

function settledPose(o: IdleOption, floor: FloorLayout | null, slot: Slot | null): PoseKey {
  const pose = toPoseKey(o.anim)
  // "Nap" options use the furniture's own lying / sitting pose away from the desk.
  if (pose === 'nap_desk' && floor && slot) return stationFor(floor, slot).pose
  return pose
}

/**
 * P05 idle brain: seeded weighted pick among the top N options. The random
 * stream is `seed:personId:epoch`, so a choice is stable inside one epoch and
 * reproducible from the same seed, config and event log. Reserves the spot
 * (and the partner's place for pair options) in the ledger.
 */
export function chooseIdle(person: IdlePerson, world: IdleWorld): IdleDecision {
  const { config, ledger } = world
  const epoch = idleEpoch(world.clock.simMs, config.epochMinutes)
  const rng = makeRng(`${world.seed}:${person.id}:${epoch}`)
  const ranked = scoreIdleOptions(person, world).filter((c) => c.score > 0)
  const top = ranked.slice(0, Math.max(1, config.topN))
  const total = top.reduce((sum, c) => sum + c.score, 0)
  let roll = rng() * total
  let pick: ScoredOption | null = top[top.length - 1] ?? null
  for (const c of top) {
    roll -= c.score
    if (roll < 0) {
      pick = c
      break
    }
  }

  if (!pick) {
    return {
      key: 'stay_at_desk',
      intent: { kind: 'IdleAtDesk' },
      emote: null,
      dwellSimMinutes: config.epochMinutes,
      partnerId: null,
      pose: 'sit',
      spot: null,
    }
  }
  const o = pick.option
  const [lo, hi] = o.durationMinutes
  const dwellSimMinutes = lo + rng() * (hi - lo)
  const pose = settledPose(o, pick.floor, pick.slot)
  const emote = o.emote ?? null

  if (!pick.floor || !pick.slot) {
    // Lunch / night with no free bed or sofa: a nap at the desk, never a bed pose on a chair.
    const nap = pose === 'nap_desk' || isCalendarOption(o)
    const intent: Intent = nap ? { kind: 'NapAtDesk' } : { kind: 'IdleAtDesk', pose }
    return { key: o.key, intent, emote, dwellSimMinutes, partnerId: null, pose: nap ? 'nap_desk' : pose, spot: null }
  }

  const spot = { floorIndex: pick.floor.index, floorKey: pick.floor.key, slotId: pick.slot.id }
  const slotKey = SlotLedger.key(pick.floor.key, pick.slot.id)
  const places = placesFor(o, pick.slot)
  ledger.reserve(slotKey, person.id, places)
  const partner = pick.partner
  if (partner) ledger.reserve(slotKey, partner.id, places)
  return {
    key: o.key,
    intent: spotIntent(person.homeFloorIndex, spot, pose),
    emote,
    dwellSimMinutes,
    partnerId: partner?.id ?? null,
    pose,
    spot,
  }
}

/**
 * Elevator scheduler (P04-T04, R7): a deterministic, pure state machine.
 *
 * - Collective control: a car keeps its direction while it has stops ahead,
 *   stops for riders getting off and for assigned callers going its way, and
 *   reverses at the furthest call.
 * - Assignment by estimated time to boarding. The estimate runs the very same
 *   car state machine on a copy, so it accounts for stops, door cycles,
 *   reversals and capacity.
 * - No randomness, no wall clock: the same call/cancel/release/step sequence
 *   always produces the same trace.
 */

export interface ElevatorConfig {
  floorCount: number
  /** From building.json (2). */
  cars: number
  /** 1.5 */
  speedFloorsPerSec: number
  /** Full open + close budget: opening takes half, closing takes half. */
  doorSeconds: number
  /** 6 */
  capacity: number
  /** Dwell with doors fully open (default 1.6). Restarts when someone boards or alights, capped at 3× per stop. */
  loadSeconds?: number
  /** Default: car 0 at floor 0, car 1 at the middle floor, further cars spread evenly. */
  startFloors?: number[]
}

export type CarPhase = 'idle' | 'moving' | 'doors_opening' | 'loading' | 'doors_closing'

export interface CarState {
  index: number
  /** Fractional floor index (0 = ground), continuous while moving. */
  position: number
  phase: CarPhase
  /** Committed travel direction (0 when idle). */
  direction: -1 | 0 | 1
  /** 0 closed … 1 fully open. */
  door01: number
  /** In boarding order. Arrived passengers are no longer listed here. */
  riders: readonly string[]
  /** Floors it is committed to stop at, ascending (debug). */
  stops: readonly number[]
}

export type PassengerPhase = 'waiting' | 'riding' | 'arrived'

export interface PassengerState {
  id: string
  from: number
  to: number
  phase: PassengerPhase
  /** Assigned car while waiting (may be reassigned), the car ridden while riding/arrived. */
  car: number | null
  /** Position in the FIFO line of the assigned car at this floor (0 = first) while waiting, else -1. */
  queueIndex: number
  /** Seconds spent waiting since call(); frozen once the passenger boards. */
  waited: number
}

export const ELEVATOR_DEFAULT_LOAD_SECONDS = 1.6
/** A stop never dwells longer than this many × loadSeconds, however many people keep boarding. */
export const ELEVATOR_LOAD_RESTART_CAP = 3

const EPS = 1e-9
const SUBSTEP_SECONDS = 0.1
/** How often waiting passengers are re-evaluated against all cars. */
const REBALANCE_SECONDS = 0.5
/** Another car must beat the assigned one by this many seconds to take a passenger over. */
const REBALANCE_MARGIN_SECONDS = 2
const NEVER = 1e9

type Dir = -1 | 0 | 1

interface Person {
  id: string
  from: number
  to: number
  dir: -1 | 1
  /** Call order: the FIFO key. */
  seq: number
  phase: PassengerPhase
  car: number | null
  waited: number
}

interface Car {
  index: number
  position: number
  phase: CarPhase
  direction: Dir
  door01: number
  riders: Person[]
  /** Seconds since the last boarding/alighting in the current stop. */
  loadTimer: number
  /** Seconds the doors have been fully open in the current stop. */
  loadTotal: number
  /** Set when doors start closing: the system re-evaluates whoever was left behind. */
  closingStarted: boolean
}

interface Timing {
  speed: number
  halfDoor: number
  load: number
  capacity: number
}

interface Hooks {
  alight(p: Person): void
  board(p: Person): void
}

function flip(d: Dir): Dir {
  return d === 1 ? -1 : d === -1 ? 1 : 0
}

/** `floor` lies strictly ahead of `pos` when travelling in `d`. */
function beyond(floor: number, pos: number, d: Dir): boolean {
  return (floor - pos) * d > EPS
}

/** Does the car, standing at a floor, still have something to do in direction `d`? */
function hasWork(car: Car, assigned: readonly Person[], d: Dir): boolean {
  const pos = car.position
  for (const r of car.riders) if (beyond(r.to, pos, d)) return true
  for (const p of assigned) {
    if (beyond(p.from, pos, d)) return true
    if (p.from === pos && p.dir === d) return true
  }
  return false
}

/**
 * Direction of a car standing at a floor: keep going while there is work
 * ahead, else reverse if there is work behind, else head for the oldest call.
 */
function chooseDirection(car: Car, assigned: readonly Person[]): Dir {
  const d = car.direction
  if (d !== 0) {
    if (hasWork(car, assigned, d)) return d
    const back = flip(d)
    if (hasWork(car, assigned, back)) return back
  }
  const oldest = assigned[0]
  if (oldest === undefined) return 0
  if (oldest.from === car.position) return oldest.dir
  return oldest.from > car.position ? 1 : -1
}

/**
 * Next floor strictly ahead where a car travelling in `d` must stop: a rider's
 * destination, an assigned caller going the same way (skipped while full), or
 * the furthest opposite-direction caller when nothing lies beyond it.
 */
function nextTarget(car: Car, assigned: readonly Person[], d: Dir, capacity: number): number | null {
  if (d === 0) return null
  const pos = car.position
  let nearest: number | null = null
  let last: number | null = null
  let far: number | null = null
  const consider = (f: number) => {
    if (nearest === null || (f - nearest) * d < 0) nearest = f
    if (last === null || (f - last) * d > 0) last = f
  }
  for (const r of car.riders) if (beyond(r.to, pos, d)) consider(r.to)
  const full = car.riders.length >= capacity
  for (const p of assigned) {
    if (!beyond(p.from, pos, d)) continue
    if (p.dir === d) {
      if (!full) consider(p.from)
    } else if (far === null || (p.from - far) * d > 0) {
      far = p.from
    }
  }
  if (far !== null && (last === null || (far - last) * d > 0)) consider(far)
  return nearest
}

/**
 * Advance one car by at most `dt` seconds, stopping at the first phase change.
 * Returns the time consumed (0 for instant transitions). `assigned` is the
 * car's waiting passengers in call order. Used both by the live system (small
 * dt) and by the arrival estimate (dt = Infinity on a copy).
 */
function advance(car: Car, dt: number, assigned: readonly Person[], t: Timing, hooks: Hooks): number {
  switch (car.phase) {
    case 'idle': {
      car.direction = 0
      const d = chooseDirection(car, assigned)
      if (d === 0) return dt
      car.direction = d
      const here = assigned.some((p) => p.from === car.position && p.dir === d)
      car.phase = here ? 'doors_opening' : 'moving'
      return 0
    }
    case 'moving': {
      const d = car.direction
      let target = nextTarget(car, assigned, d, t.capacity)
      let park = false
      if (target === null) {
        // Nothing left ahead (cancelled): coast to the next floor and decide there.
        target = d > 0 ? Math.ceil(car.position - EPS) : Math.floor(car.position + EPS)
        park = true
      }
      const need = Math.abs(target - car.position) / t.speed
      if (dt < need - EPS) {
        car.position += d * t.speed * dt
        return dt
      }
      car.position = target
      if (park) {
        car.phase = 'idle'
        car.direction = 0
      } else {
        car.phase = 'doors_opening'
        car.direction = chooseDirection(car, assigned)
      }
      return Math.min(need, dt)
    }
    case 'doors_opening': {
      const need = (1 - car.door01) * t.halfDoor
      if (dt < need - EPS) {
        car.door01 += dt / t.halfDoor
        return dt
      }
      car.door01 = 1
      car.phase = 'loading'
      car.loadTimer = 0
      car.loadTotal = 0
      return Math.min(need, dt)
    }
    case 'loading': {
      let changed = false
      // 1. Riders for this floor get off.
      if (car.riders.some((r) => r.to === car.position)) {
        const staying: Person[] = []
        for (const r of car.riders) {
          if (r.to === car.position) hooks.alight(r)
          else staying.push(r)
        }
        car.riders = staying
        changed = true
      }
      // 2. Settle the direction, then callers going that way board FIFO.
      car.direction = chooseDirection(car, assigned)
      for (const p of assigned) {
        if (car.riders.length >= t.capacity) break
        if (p.from !== car.position || p.dir !== car.direction) continue
        car.riders.push(p)
        hooks.board(p)
        changed = true
      }
      if (changed) car.loadTimer = 0
      const need = Math.max(
        0,
        Math.min(t.load - car.loadTimer, ELEVATOR_LOAD_RESTART_CAP * t.load - car.loadTotal),
      )
      if (dt < need - EPS) {
        car.loadTimer += dt
        car.loadTotal += dt
        return dt
      }
      car.phase = 'doors_closing'
      car.closingStarted = true
      return Math.min(need, dt)
    }
    case 'doors_closing': {
      const need = car.door01 * t.halfDoor
      if (dt < need - EPS) {
        car.door01 -= dt / t.halfDoor
        return dt
      }
      car.door01 = 0
      const d = chooseDirection(car, assigned)
      if (d !== 0 && nextTarget(car, assigned, d, t.capacity) !== null) {
        car.direction = d
        car.phase = 'moving'
      } else {
        // Nothing ahead. Idle re-opens for a late caller here or heads for the oldest call.
        car.direction = 0
        car.phase = 'idle'
      }
      return Math.min(need, dt)
    }
  }
}

function defaultStartFloors(cars: number, floorCount: number): number[] {
  if (cars === 2) return [0, Math.floor(floorCount / 2)]
  const out: number[] = []
  for (let i = 0; i < cars; i++) {
    out.push(cars === 1 ? 0 : Math.round((i * (floorCount - 1)) / (cars - 1)))
  }
  return out
}

export class ElevatorSystem {
  private readonly floorCount: number
  private readonly timing: Timing
  private readonly carList: Car[]
  private readonly people = new Map<string, Person>()
  /** Waiting passengers in call order (seq ascending). */
  private waiting: Person[] = []
  private seq = 0
  private rebalanceTimer = 0

  constructor(config: ElevatorConfig) {
    const { floorCount, cars, speedFloorsPerSec, doorSeconds, capacity } = config
    if (!Number.isInteger(floorCount) || floorCount < 1) throw new RangeError('elevator: floorCount must be >= 1')
    if (!Number.isInteger(cars) || cars < 1) throw new RangeError('elevator: cars must be >= 1')
    if (!(speedFloorsPerSec > 0)) throw new RangeError('elevator: speedFloorsPerSec must be > 0')
    if (!(doorSeconds >= 0)) throw new RangeError('elevator: doorSeconds must be >= 0')
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('elevator: capacity must be >= 1')
    const load = config.loadSeconds ?? ELEVATOR_DEFAULT_LOAD_SECONDS
    if (!(load >= 0)) throw new RangeError('elevator: loadSeconds must be >= 0')
    this.floorCount = floorCount
    this.timing = { speed: speedFloorsPerSec, halfDoor: doorSeconds / 2, load, capacity }
    const defaults = defaultStartFloors(cars, floorCount)
    this.carList = []
    for (let i = 0; i < cars; i++) {
      const wanted = config.startFloors?.[i] ?? defaults[i] ?? 0
      const floor = Math.min(floorCount - 1, Math.max(0, Math.round(wanted)))
      this.carList.push({
        index: i,
        position: floor,
        phase: 'idle',
        direction: 0,
        door01: 0,
        riders: [],
        loadTimer: 0,
        loadTotal: 0,
        closingStarted: false,
      })
    }
  }

  /**
   * A person standing at `from` wants to go to `to`. Calling again for the same
   * id replaces the request while waiting (or after arriving); it is ignored
   * while riding. `from === to` → immediately 'arrived' with car null.
   */
  call(id: string, from: number, to: number): void {
    this.assertFloor(from)
    this.assertFloor(to)
    const existing = this.people.get(id)
    if (existing !== undefined) {
      if (existing.phase === 'riding') return
      this.forget(existing)
    }
    const person: Person = {
      id,
      from,
      to,
      dir: to > from ? 1 : -1,
      seq: this.seq++,
      phase: 'waiting',
      car: null,
      waited: 0,
    }
    this.people.set(id, person)
    if (from === to) {
      person.phase = 'arrived'
      return
    }
    this.waiting.push(person)
    person.car = this.bestCar(person).car
  }

  /** Remove the person wherever they are (a rider is dropped from the car immediately). */
  cancel(id: string): void {
    const person = this.people.get(id)
    if (person !== undefined) this.forget(person)
  }

  /** The person has left the car after 'arrived'; forget them. No-op in any other phase. */
  release(id: string): void {
    const person = this.people.get(id)
    if (person !== undefined && person.phase === 'arrived') this.people.delete(id)
  }

  passenger(id: string): PassengerState | null {
    const p = this.people.get(id)
    if (p === undefined) return null
    let queueIndex = -1
    if (p.phase === 'waiting') {
      queueIndex = 0
      for (const q of this.waiting) {
        if (q === p) break
        if (q.from === p.from && q.car === p.car) queueIndex++
      }
    }
    return { id: p.id, from: p.from, to: p.to, phase: p.phase, car: p.car, queueIndex, waited: p.waited }
  }

  /** FIFO waiting line for one car at a floor (ids). */
  queue(floor: number, car: number): readonly string[] {
    const out: string[] = []
    for (const p of this.waiting) if (p.from === floor && p.car === car) out.push(p.id)
    return out
  }

  cars(): readonly CarState[] {
    return this.carList.map((car) => {
      const stops = new Set<number>()
      for (const r of car.riders) stops.add(r.to)
      for (const p of this.waiting) if (p.car === car.index) stops.add(p.from)
      return {
        index: car.index,
        position: car.position,
        phase: car.phase,
        direction: car.direction,
        door01: car.door01,
        riders: car.riders.map((r) => r.id),
        stops: [...stops].sort((a, b) => a - b),
      }
    })
  }

  /** `dt` in seconds. Sub-steps internally at <= 0.1 s. */
  step(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return
    const n = Math.max(1, Math.ceil(dt / SUBSTEP_SECONDS - EPS))
    const h = dt / n
    for (let i = 0; i < n; i++) this.substep(h)
  }

  /** Snap helper for catch-up: drop every request and park cars (idle, doors closed) at the nearest floor. */
  reset(): void {
    this.people.clear()
    this.waiting = []
    this.rebalanceTimer = 0
    for (const car of this.carList) {
      car.position = Math.min(this.floorCount - 1, Math.max(0, Math.round(car.position)))
      car.phase = 'idle'
      car.direction = 0
      car.door01 = 0
      car.riders = []
      car.loadTimer = 0
      car.loadTotal = 0
      car.closingStarted = false
    }
  }

  // ── internals ────────────────────────────────────────────────────────────

  private assertFloor(floor: number): void {
    if (!Number.isInteger(floor) || floor < 0 || floor >= this.floorCount) {
      throw new RangeError(`elevator: floor ${floor} is outside 0..${this.floorCount - 1}`)
    }
  }

  private forget(person: Person): void {
    this.people.delete(person.id)
    if (person.phase === 'waiting') {
      this.waiting = this.waiting.filter((p) => p !== person)
    } else if (person.phase === 'riding' && person.car !== null) {
      const car = this.carList[person.car]
      if (car !== undefined) car.riders = car.riders.filter((p) => p !== person)
    }
  }

  private substep(h: number): void {
    for (const p of this.waiting) p.waited += h
    let leftBehind = false
    for (const car of this.carList) {
      const hooks: Hooks = {
        alight: (p) => {
          p.phase = 'arrived'
        },
        board: (p) => {
          p.phase = 'riding'
          p.car = car.index
          this.waiting = this.waiting.filter((q) => q !== p)
        },
      }
      let remaining = h
      // Instant transitions consume 0; a handful per sub-step is the most that can chain.
      for (let guard = 0; guard < 16 && remaining > EPS; guard++) {
        const assigned = this.waiting.filter((p) => p.car === car.index)
        remaining -= advance(car, remaining, assigned, this.timing, hooks)
      }
      if (car.closingStarted) {
        car.closingStarted = false
        leftBehind = true
      }
    }
    this.rebalanceTimer += h
    if (leftBehind || this.rebalanceTimer >= REBALANCE_SECONDS - EPS) {
      this.rebalanceTimer = 0
      this.rebalance()
    }
  }

  /** Move waiting passengers to a car that is clearly better (overflow, a car already at the floor…). */
  private rebalance(): void {
    if (this.carList.length < 2) return
    for (const p of [...this.waiting]) {
      if (p.car === null) continue
      const current = this.eta(p.car, p)
      const best = this.bestCar(p)
      if (best.car !== p.car && best.eta < current - REBALANCE_MARGIN_SECONDS) p.car = best.car
    }
  }

  /** Car with the lowest estimated time to boarding; ties go to the lower index. */
  private bestCar(p: Person): { car: number; eta: number } {
    let car = 0
    let best = Infinity
    for (const c of this.carList) {
      const eta = this.eta(c.index, p)
      if (eta < best - EPS) {
        best = eta
        car = c.index
      }
    }
    return { car, eta: best }
  }

  /**
   * Seconds until `p` would board car `carIndex` if assigned to it, found by
   * running the car state machine on a copy with its current commitments.
   */
  private eta(carIndex: number, p: Person): number {
    const real = this.carList[carIndex]
    if (real === undefined) return NEVER
    const sim: Car = { ...real, riders: real.riders.slice() }
    const pool = this.waiting.filter((q) => q === p || q.car === carIndex)
    const gone = new Set<Person>()
    let boarded = false
    const hooks: Hooks = {
      alight: () => {},
      board: (q) => {
        gone.add(q)
        if (q === p) boarded = true
      },
    }
    const limit = 8 * (2 * this.floorCount + pool.length + 4)
    let t = 0
    for (let i = 0; i < limit; i++) {
      const assigned = gone.size === 0 ? pool : pool.filter((q) => !gone.has(q))
      t += advance(sim, Infinity, assigned, this.timing, hooks)
      if (boarded) return t
    }
    return NEVER
  }
}

import type { BuildingConfig, Slot } from '@/domain/config'
import type { OfficeEvent } from '@/domain/events'
import type { DepartmentId, EmployeeId } from '@/domain/primitives'
import type { OfficeState, PersonRuntime, Question } from '@/domain/work'
import type { BuildingLayout, FloorLayout } from '@/scene/layout'
import { ElevatorSystem, type CarState } from '@/scene/nav/elevator'
import { buildGrid } from '@/scene/nav/grid'
import { navigate } from '@/scene/nav/navigate'
import {
  elevatorDoorCentre,
  elevatorDoorPoint,
  elevatorLobbyPoint,
  stairsPoint,
} from '@/scene/nav/routeGraph'
import { stairsTime } from '@/scene/nav/stairs'
import type { NavGrid, Vec2 } from '@/scene/nav/types'
import { heldItemFor } from './held'
import type { EmoteKey, IdleBehaviours } from '@/domain/visual'
import {
  calendarPhase,
  chooseIdle,
  chooseIdleIntent,
  chooseRestIntent,
  idleClock,
  spotIntent,
  type IdleContext,
  type IdlePartner,
} from './idleBrain'
import {
  deriveIntent,
  employeeIndex,
  emptyMemory,
  intentKey,
  isLeisureIntent,
  isOwner,
  type Intent,
  type PersonMemory,
} from './intents'
import { entrancePoint, plan, type PlanContext, type WaitingPlace } from './planner'
import { isSeatedPose, type PoseKey } from './poses'
import { makeRng, type Rng } from './rng'
import { allocateSeats, benchOf, linePoint, nearestFree, type SeatPlace } from './seating'
import { SlotLedger } from './slots'
import { deskStationOf, headingTo } from './stations'
import { TUNING } from './tuning'
import type { Action, Errand, PersonSim, Station, WaitingSpot } from './types'

export interface DirectorOptions {
  /** Seeds every person's idle choices. Same seed + same input → same movement. */
  seed?: string
  warn?: (message: string) => void
  /**
   * P05 idle brain config (`idle-behaviours.json`), passed in by the caller so
   * the director never imports content. Missing → the P04 idle brain.
   */
  idle?: IdleBehaviours
}

export interface DirectorStats {
  people: number
  /** Errands waiting for legs, summed and worst single person. */
  backlogTotal: number
  backlogMax: number
  delivered: number
  collapsed: number
  teleports: number
  elevatorTrips: number
  stairsTrips: number
}

export interface PersonDebug {
  id: EmployeeId
  floorKey: string
  intent: string
  action: string
  backlog: number
  x: number
  y: number
  z: number
  pose: PoseKey
  visible: boolean
  /** Index of the running action in the plan. */
  step: number
}

interface Agent {
  id: EmployeeId
  departmentId: DepartmentId | null
  sim: PersonSim
  memory: PersonMemory & { errands: Errand[] }
  rng: Rng
  /** Logical position; `sim.x/z` adds the separation offset. */
  bx: number
  bz: number
  offX: number
  offZ: number
  floorKey: string
  desk: Station
  /** Where the person is settled (seated / standing at a spot), or null while moving. */
  station: Station | null
  intent: Intent
  intentKey: string
  plan: Action[]
  step: number
  /** Seconds spent in the current action. */
  t: number
  started: boolean
  /** Scratch for the running action. */
  path: Vec2[] | null
  pathIndex: number
  fromX: number
  fromZ: number
  teleporting: boolean
  fast: number
  opacityTarget: number
  /** Idle dwell: ends on whichever limit comes first. */
  dwellVisualLeft: number
  dwellSimEndMs: number
  restFor: PersonRuntime['activity'] | null
  car: number
  gone: boolean
  /** A courier's paper is in hand (between the plan's `pick` and `drop`). */
  paper: boolean
  /** P05 idle brain: option key, its emote, recent keys, pair partner, calendar phase. */
  idleKey: string | null
  idleEmote: EmoteKey | null
  idleHistory: string[]
  partnerId: EmployeeId | null
  idlePhase: string | null
}

const TWO_PI = Math.PI * 2

interface Waiting {
  floorIndex: number
  nearEmployeeId: EmployeeId
  place: SeatPlace
}

function turnToward(current: number, target: number, maxStep: number): number {
  let diff = (target - current) % TWO_PI
  if (diff > Math.PI) diff -= TWO_PI
  if (diff < -Math.PI) diff += TWO_PI
  if (Math.abs(diff) <= maxStep) return target
  return current + Math.sign(diff) * maxStep
}

const IDLE_FALLBACK: Pick<
  PersonRuntime,
  'activity' | 'taskId' | 'carrying' | 'platformKey' | 'idleSince' | 'location'
> = {
  activity: 'idle',
  taskId: null,
  carrying: null,
  platformKey: null,
  idleSince: null,
  location: null,
}

/**
 * The only place where "what the business is doing" becomes "what a character
 * does" (00-overview §2.2). Pure and deterministic: it is fed `OfficeState`
 * snapshots and ticked with visual seconds; it never reads a clock.
 */
export class Director {
  private layout: BuildingLayout
  private readonly building: BuildingConfig['elevator']
  private readonly seed: string
  private readonly warn: (message: string) => void
  private readonly warned = new Set<string>()
  private readonly idleConfig: IdleBehaviours | null
  /** Visual seconds since start (alternates the chat bubbles of a pair). */
  private visualT = 0

  private grids = new Map<number, NavGrid>()
  private elevatorSystem: ElevatorSystem
  private readonly ledger = new SlotLedger()

  private readonly agents = new Map<EmployeeId, Agent>()
  private order: Agent[] = []
  private sims: PersonSim[] = []

  private state: OfficeState | null = null
  private lastSeq = -1
  private simNowMs = 0
  private visible: (floorIndex: number) => boolean = () => true

  private readonly inTransitByApprover = new Map<EmployeeId, number>()
  /** P05-T07: who waits face to face, and where (seat or line place). */
  private waiting = new Map<EmployeeId, Waiting>()
  private readonly deptCounts = new Map<string, { total: number; away: number }>()
  private counters = { delivered: 0, collapsed: 0, teleports: 0, elevatorTrips: 0, stairsTrips: 0 }

  constructor(layout: BuildingLayout, elevator: BuildingConfig['elevator'], options: DirectorOptions = {}) {
    this.layout = layout
    this.building = elevator
    this.seed = options.seed ?? 'office'
    this.warn = options.warn ?? (() => {})
    this.idleConfig = options.idle ?? null
    this.elevatorSystem = this.makeElevators()
  }

  // ───────────────────────────── inputs ─────────────────────────────

  /** The building changed (hire, new department): keep everybody, re-plan from where they are. */
  setLayout(layout: BuildingLayout): void {
    if (layout === this.layout) return
    const floorCountChanged = layout.floors.length !== this.layout.floors.length
    this.layout = layout
    this.grids = new Map()
    this.ledger.clear()
    if (floorCountChanged) this.elevatorSystem = this.makeElevators()

    for (const agent of this.order) {
      const wasAtDesk = agent.station !== null && agent.station.isDesk
      agent.desk = this.deskFor(agent.id, agent.departmentId)
      const mapped = layout.byKey[agent.floorKey]
      const midVertical = floorCountChanged && this.isVertical(agent)
      if (mapped === undefined || midVertical || wasAtDesk) {
        // Their floor is gone, their car was rebuilt, or their desk may have
        // moved: put them at the (possibly new) desk.
        if (midVertical) this.elevatorSystem.cancel(agent.id)
        this.seatAtDesk(agent)
      } else {
        agent.sim.floorIndex = mapped
        agent.sim.y = layout.floors[mapped]!.y
        agent.sim.prevY = agent.sim.y
        if (agent.station) {
          // A shared spot may have moved with the template: stand up in place.
          agent.station = null
          agent.sim.seated = false
        }
      }
      this.clearPlan(agent)
    }
  }

  /** Which floors the camera shows (catch-up rule 3). Default: all. */
  setVisibility(visible: ((floorIndex: number) => boolean) | null): void {
    this.visible = visible ?? (() => true)
  }

  /** Feed the latest state. New events since the previous call become errands and arrivals. */
  sync(state: OfficeState): void {
    if (state === this.state) return
    const isReset = this.state === null || state.seq < this.lastSeq
    this.state = state
    this.simNowMs = Date.parse(state.now)

    const hired = new Set<EmployeeId>()
    if (isReset) {
      this.resetPeople()
    } else if (state.seq > this.lastSeq) {
      for (const event of state.log) {
        if (event.seq <= this.lastSeq) continue
        this.ingest(event, state, hired)
      }
    }
    this.lastSeq = state.seq
    this.reconcile(state, hired, isReset)
    this.updateSeating(state)
  }

  // ───────────────────────────── outputs ─────────────────────────────

  people(): readonly PersonSim[] {
    return this.sims
  }

  person(id: EmployeeId): PersonSim | null {
    return this.agents.get(id)?.sim ?? null
  }

  elevators(): readonly CarState[] {
    return this.elevatorSystem.cars()
  }

  /** Review papers still being carried to this approver (P05: pile = state − inTransit). */
  inTransit(approverId: EmployeeId): number {
    return this.inTransitByApprover.get(approverId) ?? 0
  }

  /** P05-T07: the waiting seat / line place of a person asking in person, or null. */
  waitingOf(id: EmployeeId): WaitingSpot | null {
    const w = this.waiting.get(id)
    if (!w || !this.agents.has(id)) return null
    return { nearEmployeeId: w.nearEmployeeId, index: w.place.index, seated: w.place.seated }
  }

  backlogOf(id: EmployeeId): number {
    return this.agents.get(id)?.memory.errands.length ?? 0
  }

  stats(): DirectorStats {
    let backlogTotal = 0
    let backlogMax = 0
    for (const agent of this.order) {
      const n = agent.memory.errands.length
      backlogTotal += n
      if (n > backlogMax) backlogMax = n
    }
    return { people: this.order.length, backlogTotal, backlogMax, ...this.counters }
  }

  debugPeople(): PersonDebug[] {
    return this.order.map((agent) => ({
      id: agent.id,
      floorKey: agent.floorKey,
      intent: agent.intentKey,
      action: agent.plan[agent.step]?.k ?? 'none',
      backlog: agent.memory.errands.length,
      x: agent.sim.x,
      y: agent.sim.y,
      z: agent.sim.z,
      pose: agent.sim.pose,
      visible: agent.sim.visible,
      step: agent.step,
    }))
  }

  /** The person's current plan (tests, debug overlay). */
  planOf(id: EmployeeId): readonly Action[] {
    return this.agents.get(id)?.plan ?? []
  }

  gridOf(floorIndex: number): NavGrid {
    let grid = this.grids.get(floorIndex)
    if (!grid) {
      grid = buildGrid(this.layout.floors[floorIndex]!)
      this.grids.set(floorIndex, grid)
    }
    return grid
  }

  // ───────────────────────────── tick ─────────────────────────────

  /** Advance by `dt` visual seconds (fixed 0.1 s steps from the renderer). */
  tick(dt: number): void {
    if (!this.state || dt <= 0) return
    this.visualT += dt
    this.elevatorSystem.step(dt)
    this.countDepartments()

    for (const agent of this.order) {
      const sim = agent.sim
      sim.prevX = sim.x
      sim.prevZ = sim.z
      sim.prevY = sim.y
      this.think(agent)
    }
    for (const agent of this.order) {
      this.act(agent, dt)
      this.dress(agent)
      this.fade(agent, dt)
    }
    this.separate(dt)

    let anyGone = false
    for (const agent of this.order) {
      if (agent.gone) {
        anyGone = true
        this.remove(agent)
      }
    }
    if (anyGone) this.rebuildOrder()
  }

  // ───────────────────────────── population ─────────────────────────────

  private makeElevators(): ElevatorSystem {
    return new ElevatorSystem({
      floorCount: this.layout.floors.length,
      cars: Math.max(1, Math.min(this.building.cars, this.layout.floors[0]?.elevatorDoorSlots.length ?? 1)),
      speedFloorsPerSec: this.building.speedFloorsPerSec,
      doorSeconds: this.building.doorSeconds,
      capacity: this.building.capacity,
    })
  }

  private resetPeople(): void {
    this.agents.clear()
    this.order = []
    this.sims = []
    this.ledger.clear()
    this.elevatorSystem = this.makeElevators()
    this.inTransitByApprover.clear()
    this.waiting = new Map()
    this.counters = { delivered: 0, collapsed: 0, teleports: 0, elevatorTrips: 0, stairsTrips: 0 }
  }

  private reconcile(state: OfficeState, hired: ReadonlySet<EmployeeId>, isReset: boolean): void {
    let changed = false
    for (const emp of state.config.employees) {
      const active = emp.state === 'active' && state.people[emp.id] !== undefined
      const agent = this.agents.get(emp.id)
      if (active && !agent) {
        this.spawn(emp.id, emp.departmentId, !isReset && hired.has(emp.id))
        changed = true
      } else if (active && agent && agent.memory.leaving) {
        // Restored before reaching the door.
        agent.memory.leaving = false
      } else if (!active && agent && !agent.memory.leaving) {
        agent.memory.leaving = true
      }
    }
    const known = employeeIndex(state)
    for (const agent of this.order) {
      if (!known.has(agent.id)) agent.memory.leaving = true
    }
    if (changed) this.rebuildOrder()
  }

  private rebuildOrder(): void {
    this.order = [...this.agents.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    this.sims = this.order.map((a) => a.sim)
  }

  /** Everybody has a workspace: people the building has no desk for stand by their floor's lifts. */
  private deskFor(id: EmployeeId, departmentId: DepartmentId | null): Station {
    const desk = deskStationOf(this.layout, id)
    if (desk) return desk
    const floor =
      this.layout.floors.find((f) => f.departmentId !== null && f.departmentId === departmentId) ??
      this.layout.floors[0]!
    const lobby = elevatorLobbyPoint(floor, TUNING.elevator.lobbyInset + 1)
    const spot = this.spread(lobby, id)
    const slot: Slot = { id: `__standing_${id}`, type: 'idle_chat', x: spot.x, z: spot.z, rotY: 0 }
    return {
      floorIndex: floor.index,
      floorKey: floor.key,
      slot,
      approach: spot,
      seat: spot,
      heading: Math.PI,
      pose: 'stand',
      isDesk: true,
    }
  }

  private spread(p: Vec2, id: string): Vec2 {
    const r = makeRng(`${this.seed}:spread:${id}`)
    return { x: p.x - r() * 1.5, z: p.z + (r() - 0.5) * 2 }
  }

  private spawn(id: EmployeeId, departmentId: DepartmentId | null, arriving: boolean): void {
    const desk = this.deskFor(id, departmentId)
    const rng = makeRng(`${this.seed}:${id}`)
    const sim: PersonSim = {
      id,
      floorIndex: desk.floorIndex,
      x: desk.seat.x,
      z: desk.seat.z,
      y: this.layout.floors[desk.floorIndex]!.y,
      prevX: desk.seat.x,
      prevZ: desk.seat.z,
      prevY: this.layout.floors[desk.floorIndex]!.y,
      heading: desk.heading,
      pose: desk.pose,
      speed01: 0,
      carrying: null,
      seated: isSeatedPose(desk.pose),
      opacity: 1,
      visible: true,
      inCar: -1,
      emote: null,
      idleKey: null,
    }
    const [lo, hi] = TUNING.idle.dwellSimMinutes
    const firstDwell = (lo + rng() * (hi - lo)) * TUNING.idle.firstDwellScale * rng()
    const agent: Agent = {
      id,
      departmentId,
      sim,
      memory: { ...emptyMemory(), errands: [] },
      rng,
      bx: desk.seat.x,
      bz: desk.seat.z,
      offX: 0,
      offZ: 0,
      floorKey: desk.floorKey,
      desk,
      station: desk,
      intent: { kind: 'IdleAtDesk' },
      intentKey: '',
      plan: [],
      step: 0,
      t: 0,
      started: false,
      path: null,
      pathIndex: 0,
      fromX: 0,
      fromZ: 0,
      teleporting: false,
      fast: 1,
      opacityTarget: 1,
      dwellVisualLeft: firstDwell * TUNING.idle.visualSecondsPerSimMinute,
      dwellSimEndMs: this.simNowMs + firstDwell * 60_000,
      restFor: null,
      car: -1,
      gone: false,
      paper: false,
      idleKey: null,
      idleEmote: null,
      idleHistory: [],
      partnerId: null,
      idlePhase: null,
    }
    if (arriving) {
      const door = entrancePoint(this.layout)
      agent.memory.arriving = true
      agent.memory.atDesk = false
      agent.station = null
      this.place(agent, door.floor, door.point)
      sim.opacity = 0
      sim.pose = 'stand'
      sim.seated = false
      sim.heading = Math.PI / 2
    }
    this.agents.set(id, agent)
  }

  private remove(agent: Agent): void {
    this.elevatorSystem.cancel(agent.id)
    this.ledger.releaseAll(agent.id)
    for (const errand of agent.memory.errands) this.untrack(errand)
    this.agents.delete(agent.id)
  }

  private seatAtDesk(agent: Agent): void {
    const desk = agent.desk
    this.place(agent, desk.floorIndex, desk.seat)
    agent.station = desk
    agent.sim.heading = desk.heading
    agent.sim.pose = desk.pose
    agent.sim.seated = isSeatedPose(desk.pose)
    agent.sim.visible = true
    agent.sim.opacity = 1
    agent.opacityTarget = 1
    agent.sim.inCar = -1
    agent.car = -1
    agent.memory.atDesk = true
    agent.memory.awayOnWork = false
  }

  /** Put someone somewhere without a visible slide (no interpolation streak). */
  private place(agent: Agent, floorIndex: number, p: Vec2): void {
    const floor = this.layout.floors[floorIndex]!
    const sim = agent.sim
    agent.bx = p.x
    agent.bz = p.z
    agent.offX = 0
    agent.offZ = 0
    agent.floorKey = floor.key
    sim.floorIndex = floorIndex
    sim.x = p.x
    sim.z = p.z
    sim.y = floor.y
    sim.prevX = p.x
    sim.prevZ = p.z
    sim.prevY = floor.y
  }

  // ───────────────────────────── events → errands ─────────────────────────────

  private ingest(event: OfficeEvent, state: OfficeState, hired: Set<EmployeeId>): void {
    switch (event.type) {
      case 'review.requested': {
        const review = event.payload.review
        const task = state.tasks[review.taskId]
        const courier =
          task?.assigneeId && task.assigneeId !== review.assigneeId
            ? task.assigneeId
            : event.actor.kind === 'employee'
              ? event.actor.id
              : null
        this.addErrand(state, courier, review.assigneeId, event, review.id, review.taskId)
        break
      }
      case 'review.escalated': {
        const next = event.payload.newReview
        const previous = state.reviews[event.payload.reviewId]
        const courier =
          event.actor.kind === 'employee' && event.actor.id
            ? event.actor.id
            : (previous?.assigneeId ?? null)
        this.addErrand(state, courier, next.assigneeId, event, next.id, next.taskId)
        break
      }
      case 'task.assigned':
        this.addErrand(state, event.payload.byId, event.payload.assigneeId, event, null, event.payload.taskId)
        break
      case 'task.handed_off':
        this.addErrand(state, event.payload.fromId, event.payload.toId, event, null, event.payload.taskId)
        break
      case 'staff.hired':
        hired.add(event.payload.employee.id)
        break
      default:
        break
    }
  }

  private addErrand(
    state: OfficeState,
    courierId: string | null,
    toId: EmployeeId,
    event: OfficeEvent,
    reviewId: string | null,
    taskId: string | null,
  ): void {
    if (!courierId || courierId === toId) return
    const agent = this.agents.get(courierId as EmployeeId)
    if (!agent || agent.memory.leaving) return
    // Owners stay at their desk (P04); papers for people without a seat have nowhere to go.
    if (isOwner(state, agent.id)) return
    if (!this.agents.has(toId) && !this.layout.seatOf[toId]) return
    const errand: Errand = {
      id: event.id,
      toEmployeeId: toId,
      reviewId,
      taskId,
      atMs: Date.parse(event.at),
    }
    // One trip per floor: a new paper joins the others going to the same
    // floor instead of costing its own elevator ride (§3.6 rule 3).
    const errands = agent.memory.errands
    const floorOf = (id: EmployeeId) => this.agents.get(id)?.desk.floorIndex ?? -1
    const floor = floorOf(toId)
    let at = errands.length
    for (let i = errands.length - 1; i >= 0; i -= 1) {
      if (floorOf(errands[i]!.toEmployeeId) === floor) {
        at = i + 1
        break
      }
    }
    errands.splice(at, 0, errand)
    if (reviewId) {
      this.inTransitByApprover.set(toId, (this.inTransitByApprover.get(toId) ?? 0) + 1)
    }
  }

  private untrack(errand: Errand): void {
    if (!errand.reviewId) return
    const n = (this.inTransitByApprover.get(errand.toEmployeeId) ?? 0) - 1
    if (n > 0) this.inTransitByApprover.set(errand.toEmployeeId, n)
    else this.inTransitByApprover.delete(errand.toEmployeeId)
  }

  private dropOldest(agent: Agent, keep: number): void {
    const errands = agent.memory.errands
    while (errands.length > keep) {
      const dropped = errands.shift()!
      this.untrack(dropped)
      this.counters.collapsed += 1
    }
  }

  // ───────────────────────────── waiting seats (P05-T07) ─────────────────────────────

  /**
   * Everybody waiting face to face, grouped by the bench on their target's
   * floor, in order of arrival. The seated keep their seats; anyone whose
   * place changed re-plans (the line moves up).
   */
  private updateSeating(state: OfficeState): void {
    const latest = new Map<EmployeeId, Question>()
    for (const q of Object.values(state.questions)) {
      if (q.status !== 'open') continue
      const prev = latest.get(q.fromId)
      if (!prev || q.createdAt > prev.createdAt) latest.set(q.fromId, q)
    }
    const groups = new Map<number, Array<{ id: EmployeeId; near: EmployeeId; at: string }>>()
    for (const [from, q] of latest) {
      if (!q.inPerson || q.toId === from) continue
      if (!this.agents.has(from) || state.people[from]?.activity !== 'waiting_answer') continue
      const target = this.agents.get(q.toId)?.desk ?? deskStationOf(this.layout, q.toId)
      if (!target) continue
      let group = groups.get(target.floorIndex)
      if (!group) {
        group = []
        groups.set(target.floorIndex, group)
      }
      group.push({ id: from, near: q.toId, at: q.createdAt })
    }

    const next = new Map<EmployeeId, Waiting>()
    for (const [floorIndex, group] of groups) {
      const bench = benchOf(this.layout.floors[floorIndex]!)
      group.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      const previous = new Map<string, number>()
      for (const g of group) {
        const w = this.waiting.get(g.id)
        if (w && w.floorIndex === floorIndex && w.place.seated) previous.set(g.id, w.place.seat)
      }
      const places = allocateSeats(
        group.map((g) => g.id),
        bench?.seats.length ?? 0,
        previous,
      )
      places.forEach((place, i) => {
        next.set(group[i]!.id, { floorIndex, nearEmployeeId: group[i]!.near, place })
      })
    }

    for (const [id, w] of next) {
      const before = this.waiting.get(id)
      const agent = this.agents.get(id)
      if (!before || !agent || agent.intent.kind !== 'WaitInSeat') continue
      if (before.place.seat !== w.place.seat || before.place.line !== w.place.line) agent.intentKey = ''
    }
    this.waiting = next
  }

  private waitingPlace(id: EmployeeId): WaitingPlace | null {
    const w = this.waiting.get(id)
    if (!w) return null
    const bench = benchOf(this.layout.floors[w.floorIndex]!)
    if (!bench) return null
    if (w.place.seated) {
      const station = bench.seats[w.place.seat]
      return station ? { kind: 'seat', station } : null
    }
    const point = nearestFree(this.gridOf(w.floorIndex), linePoint(bench.origin, bench.dir, w.place.line))
    return { kind: 'line', floorIndex: w.floorIndex, point, facing: bench.seats[0]!.seat }
  }

  // ───────────────────────────── think: state → intent → plan ─────────────────────────────

  private countDepartments(): void {
    this.deptCounts.clear()
    for (const agent of this.order) {
      const key = agent.departmentId ?? '_'
      let c = this.deptCounts.get(key)
      if (!c) {
        c = { total: 0, away: 0 }
        this.deptCounts.set(key, c)
      }
      c.total += 1
      if (agent.intent.kind === 'RestOnLeisureFloor') c.away += 1
    }
  }

  private idleContext(agent: Agent): IdleContext {
    const c = this.deptCounts.get(agent.departmentId ?? '_')
    return {
      layout: this.layout,
      ledger: this.ledger,
      rng: agent.rng,
      homeFloorIndex: agent.desk.floorIndex,
      deptAwayShare: c && c.total > 0 ? (c.away + 1) / c.total : 1,
    }
  }

  private isVertical(agent: Agent): boolean {
    const k = agent.plan[agent.step]?.k
    return k === 'ride' || k === 'exitElevator' || (k === 'stairs' && agent.started)
  }

  private think(agent: Agent): void {
    const state = this.state!
    const runtime = state.people[agent.id]
    const memory = agent.memory
    const person: PersonRuntime = runtime ?? {
      ...IDLE_FALLBACK,
      employeeId: agent.id,
      lastActiveAt: state.now,
    }

    this.catchUp(agent)

    if (this.idleConfig) {
      this.thinkIdleP05(agent, person, this.idleConfig)
    } else {
      this.thinkIdleP04(agent, person)
    }

    const intent = deriveIntent(person, state, this.layout, memory)
    const key = intentKey(intent)
    if (key === agent.intentKey) return

    if (this.isVertical(agent)) {
      // Mid-ride or in the stairwell: finish the vertical move, then re-plan.
      this.truncateAfterVertical(agent)
      return
    }
    this.replan(agent, intent, key)
  }

  private thinkIdleP04(agent: Agent, person: PersonRuntime): void {
    const state = this.state!
    const memory = agent.memory
    // Lunch / night: choose a place once per rest period.
    const activity = person.activity
    if (activity === 'resting' || activity === 'off_shift') {
      if (agent.restFor !== activity) {
        agent.restFor = activity
        this.ledger.releaseAll(agent.id)
        memory.restChoice = isOwner(state, agent.id)
          ? null
          : chooseRestIntent(agent.id, activity, this.idleContext(agent))
      }
    } else if (agent.restFor !== null) {
      agent.restFor = null
      memory.restChoice = null
    }

    if (activity === 'idle') {
      if (
        isLeisureIntent(agent.intent) &&
        agent.plan[agent.step]?.k === 'hold' &&
        (agent.dwellVisualLeft <= 0 || this.simNowMs >= agent.dwellSimEndMs)
      ) {
        this.ledger.releaseAll(agent.id)
        const choice = chooseIdleIntent(agent.id, this.idleContext(agent))
        memory.idleChoice = choice.intent
        agent.dwellVisualLeft = choice.dwellSimMinutes * TUNING.idle.visualSecondsPerSimMinute
        agent.dwellSimEndMs = this.simNowMs + choice.dwellSimMinutes * 60_000
      }
    } else if (memory.idleChoice !== null) {
      // Any other activity interrupts idling; the choice is dropped, never queued (§3.6 rule 5).
      memory.idleChoice = null
    }
  }

  /**
   * P05-T09/T11 idle brain (§3.3). Idle, resting and off-shift people pick
   * an option from `idle-behaviours.json` when their dwell ends or the
   * calendar phase changes (lunch, night). Working people never run it, so
   * nobody is forced to nap; any work activity drops the choice at once.
   */
  private thinkIdleP05(agent: Agent, person: PersonRuntime, config: IdleBehaviours): void {
    const state = this.state!
    const memory = agent.memory
    const activity = person.activity
    const free = activity === 'idle' || activity === 'resting' || activity === 'off_shift'
    if (!free) {
      if (memory.idleChoice !== null || memory.restChoice !== null || agent.idleKey !== null) {
        this.dropIdle(agent)
      }
      return
    }
    const clock = idleClock(this.simNowMs, state.config.policy.calendar)
    const phase = `${activity}:${calendarPhase(clock)}`
    const settled = agent.plan.length === 0 || agent.plan[agent.step]?.k === 'hold' || agent.idleKey === null
    const dwellOver = agent.dwellVisualLeft <= 0 || this.simNowMs >= agent.dwellSimEndMs
    const phaseChanged = agent.idlePhase !== phase
    // Invited partners keep their joint choice until it ends for both.
    if (!phaseChanged && !(settled && dwellOver && isLeisureIntent(agent.intent))) return
    if (memory.awayOnWork && !memory.atDesk) return

    if (agent.partnerId) this.unpair(agent)
    this.ledger.releaseAll(agent.id)
    const owner = isOwner(state, agent.id)
    const dept = agent.departmentId
      ? state.config.departments.find((d) => d.id === agent.departmentId)
      : undefined
    const c = this.deptCounts.get(agent.departmentId ?? '_')
    const decision = chooseIdle(
      {
        id: agent.id,
        homeFloorIndex: agent.desk.floorIndex,
        currentFloorIndex: agent.sim.floorIndex,
        pos: { x: agent.bx, z: agent.bz },
        history: agent.idleHistory,
        is247: dept?.hours === '24_7',
        owner,
        deptAwayShare: c && c.total > 0 ? (c.away + 1) / c.total : 1,
      },
      {
        config,
        layout: this.layout,
        ledger: this.ledger,
        seed: this.seed,
        clock,
        partners: owner ? [] : this.idlePartners(agent),
      },
    )
    this.applyIdle(agent, decision.key, decision.emote, decision.intent, decision.dwellSimMinutes, phase)
    if (decision.partnerId && decision.spot) {
      const partner = this.agents.get(decision.partnerId)
      if (partner) {
        const intent = spotIntent(partner.desk.floorIndex, decision.spot, decision.pose)
        this.applyIdle(partner, decision.key, decision.emote, intent, decision.dwellSimMinutes, partner.idlePhase ?? phase)
        partner.partnerId = agent.id
        agent.partnerId = partner.id
      }
    }
  }

  private applyIdle(
    agent: Agent,
    key: string,
    emote: EmoteKey | null,
    intent: Intent,
    dwellSimMinutes: number,
    phase: string,
  ): void {
    // deriveIntent reads idleChoice when idle and restChoice when resting.
    agent.memory.idleChoice = intent
    agent.memory.restChoice = intent
    agent.idleKey = key
    agent.idleEmote = key === 'stay_at_desk' ? null : emote
    agent.idlePhase = phase
    agent.idleHistory.push(key)
    if (agent.idleHistory.length > 3) agent.idleHistory.shift()
    agent.dwellVisualLeft = dwellSimMinutes * TUNING.idle.visualSecondsPerSimMinute
    agent.dwellSimEndMs = this.simNowMs + dwellSimMinutes * 60_000
  }

  private dropIdle(agent: Agent): void {
    if (agent.partnerId) this.unpair(agent)
    agent.memory.idleChoice = null
    agent.memory.restChoice = null
    agent.idleKey = null
    agent.idleEmote = null
    agent.idlePhase = null
  }

  /** A pair ends for both: the partner re-chooses at its next think. */
  private unpair(agent: Agent): void {
    const partner = agent.partnerId ? this.agents.get(agent.partnerId) : undefined
    agent.partnerId = null
    if (partner && partner.partnerId === agent.id) {
      partner.partnerId = null
      partner.dwellVisualLeft = 0
    }
  }

  /** Idle people settled on a spot or at their desk, not paired, sorted by id. */
  private idlePartners(me: Agent): IdlePartner[] {
    const state = this.state!
    const out: IdlePartner[] = []
    for (const other of this.order) {
      if (other === me || other.partnerId || other.gone) continue
      if (state.people[other.id]?.activity !== 'idle') continue
      if (isOwner(state, other.id)) continue
      if (other.plan[other.step] && other.plan[other.step]!.k !== 'hold') continue
      out.push({ id: other.id, floorIndex: other.sim.floorIndex })
    }
    out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    return out
  }

  /** §3.6: the state moves faster than legs. */
  private catchUp(agent: Agent): void {
    const errands = agent.memory.errands
    const { catchUp } = TUNING
    // Papers for someone who has left the building have nowhere to go.
    while (errands.length > 0 && !this.agents.has(errands[0]!.toEmployeeId)) {
      this.untrack(errands.shift()!)
    }
    if (errands.length > catchUp.maxBacklog) this.dropOldest(agent, catchUp.maxBacklog)
    const n = errands.length
    if (n === 0) {
      agent.fast = 1
      return
    }
    const stale = (this.simNowMs - errands[0]!.atMs) / 60_000 > catchUp.staleSimMinutes
    if (n >= catchUp.heavyBacklog || (stale && n >= catchUp.mildBacklog)) {
      const target = this.agents.get(errands[0]!.toEmployeeId)
      const seen =
        this.visible(agent.sim.floorIndex) || (target ? this.visible(target.desk.floorIndex) : false)
      if (!seen) {
        // Nobody is watching: the papers are simply there (the piles follow the state anyway).
        this.dropOldest(agent, 0)
        agent.fast = 1
        return
      }
      // Watched: hurry, and deliver what is left in one chained trip.
      agent.fast = catchUp.heavyFactor
    } else if (n >= catchUp.mildBacklog || stale) {
      agent.fast = catchUp.mildFactor
    } else {
      agent.fast = 1
    }
  }

  private truncateAfterVertical(agent: Agent): void {
    let end = agent.step
    if (agent.plan[end]?.k === 'ride' && agent.plan[end + 1]?.k === 'exitElevator') end += 1
    if (agent.plan.length > end + 1) agent.plan.length = end + 1
  }

  private clearPlan(agent: Agent): void {
    if (agent.plan[agent.step]?.k === 'callElevator') this.elevatorSystem.cancel(agent.id)
    agent.plan = []
    agent.step = 0
    agent.t = 0
    agent.started = false
    agent.path = null
    agent.teleporting = false
    agent.intentKey = ''
    // An interrupted trip puts the paper back (the errand stays queued).
    agent.paper = false
    if (agent.sim.visible) agent.opacityTarget = 1
  }

  private replan(agent: Agent, intent: Intent, key: string): void {
    this.clearPlan(agent)
    const keep =
      intent.kind === 'IdleWander' || intent.kind === 'RestOnLeisureFloor'
        ? SlotLedger.key(intent.floorKey, intent.slotId)
        : null
    this.ledger.releaseAll(agent.id, keep)

    const leisure = isLeisureIntent(intent)
    const ctx: PlanContext = {
      layout: this.layout,
      grid: (floorIndex) => this.gridOf(floorIndex),
      ledger: this.ledger,
      deskOf: (id) => this.agents.get(id)?.desk ?? deskStationOf(this.layout, id),
      waitingPlace: (id) => this.waitingPlace(id),
      jitterSeconds: leisure ? agent.rng() * TUNING.idle.startJitterSeconds : 0,
    }
    agent.intent = intent
    agent.intentKey = key
    agent.plan = plan(
      intent,
      {
        id: agent.id,
        floorIndex: agent.sim.floorIndex,
        pos: { x: agent.bx, z: agent.bz },
        station: agent.station,
      },
      ctx,
    )
  }

  // ───────────────────────────── act: run the plan ─────────────────────────────

  private act(agent: Agent, dt: number): void {
    agent.sim.speed01 = 0
    const fromX = agent.bx
    const fromZ = agent.bz
    for (let guard = 0; guard < 8; guard += 1) {
      const action = agent.plan[agent.step]
      if (!action) return
      const done = this.run(agent, action, dt)
      agent.started = true
      if (!done) {
        agent.t += dt
        return
      }
      agent.step += 1
      agent.t = 0
      agent.started = false
      // One tick buys one tick of movement: a step that used its legs ends
      // the chain, so two moves in a row cannot double the stride.
      if (agent.bx !== fromX || agent.bz !== fromZ) return
    }
  }

  private run(agent: Agent, action: Action, dt: number): boolean {
    const sim = agent.sim
    switch (action.k) {
      case 'walk':
        return this.runWalk(agent, action, dt)

      case 'callElevator': {
        if (!agent.started) {
          this.elevatorSystem.call(agent.id, action.floor, action.to)
          this.counters.elevatorTrips += 1
        }
        const p = this.elevatorSystem.passenger(agent.id)
        if (!p || p.phase !== 'waiting') return true
        const floor = this.layout.floors[action.floor]!
        const spot = this.queueSpot(floor, p.car ?? 0, Math.max(0, p.queueIndex))
        const moving = this.steer(agent, spot, TUNING.shuffleSpeed, dt)
        if (!moving) sim.heading = turnToward(sim.heading, Math.PI / 2, TUNING.turnRate * dt)
        sim.pose = moving ? this.walkPose(agent) : 'wait_elevator'
        return false
      }

      case 'ride': {
        const p = this.elevatorSystem.passenger(agent.id)
        if (!p || p.car === null) return true
        const car = this.elevatorSystem.cars()[p.car]
        if (!car) return true
        agent.car = p.car
        if (p.phase === 'arrived') return true
        const nearest = Math.max(0, Math.min(this.layout.floors.length - 1, Math.round(car.position)))
        const floor = this.layout.floors[nearest]!
        sim.inCar = p.car
        sim.floorIndex = nearest
        agent.floorKey = floor.key
        sim.y = car.position * this.layout.floorHeight
        const place = Math.max(0, car.riders.indexOf(agent.id))
        const spot = this.carSpot(floor, p.car, place)
        const moving = this.steer(agent, spot, TUNING.shuffleSpeed, dt)
        if (!moving) sim.heading = turnToward(sim.heading, -Math.PI / 2, TUNING.turnRate * dt)
        sim.pose = moving ? this.walkPose(agent) : 'ride'
        return false
      }

      case 'exitElevator': {
        const floor = this.layout.floors[action.floor]!
        if (!agent.started) {
          sim.floorIndex = action.floor
          agent.floorKey = floor.key
          sim.y = floor.y
          sim.prevY = floor.y
          sim.inCar = -1
        }
        const door = elevatorDoorPoint(floor, Math.max(0, agent.car))
        const moving = this.steer(agent, door, TUNING.walkSpeed * agent.fast, dt)
        sim.pose = this.walkPose(agent)
        if (moving) return false
        this.elevatorSystem.release(agent.id)
        agent.car = -1
        return true
      }

      case 'stairs': {
        const fade = TUNING.fadeSeconds
        const travel = stairsTime(action.from, action.to) / agent.fast
        if (!agent.started) this.counters.stairsTrips += 1
        if (agent.t < fade) {
          agent.opacityTarget = 0
          sim.pose = 'walk'
          return false
        }
        if (agent.t < fade + travel) {
          sim.visible = false
          return false
        }
        if (!sim.visible) {
          const floor = this.layout.floors[action.to]!
          this.place(agent, action.to, stairsPoint(floor))
          sim.heading = -Math.PI / 2
          sim.visible = true
          sim.opacity = 0
          agent.opacityTarget = 1
        }
        return agent.t >= fade * 2 + travel
      }

      case 'sit': {
        const station = action.station
        if (!agent.started) {
          agent.fromX = agent.bx
          agent.fromZ = agent.bz
          agent.station = station
        }
        const k = Math.min(1, (agent.t + dt) / TUNING.sitSeconds)
        const e = k * k * (3 - 2 * k)
        agent.bx = agent.fromX + (station.seat.x - agent.fromX) * e
        agent.bz = agent.fromZ + (station.seat.z - agent.fromZ) * e
        sim.heading = turnToward(sim.heading, station.heading, TUNING.turnRate * 1.5 * dt)
        if (k < 1) return false
        sim.heading = station.heading
        sim.pose = station.pose
        sim.seated = isSeatedPose(station.pose)
        if (station.isDesk) {
          agent.memory.atDesk = true
          agent.memory.awayOnWork = false
          agent.memory.arriving = false
        }
        return true
      }

      case 'stand': {
        const station = agent.station
        if (!station) return true
        if (!agent.started) {
          agent.fromX = agent.bx
          agent.fromZ = agent.bz
          sim.pose = 'stand'
          sim.seated = false
          if (station.isDesk) {
            agent.memory.atDesk = false
            if (!isLeisureIntent(agent.intent)) agent.memory.awayOnWork = true
          }
        }
        const k = Math.min(1, (agent.t + dt) / TUNING.sitSeconds)
        agent.bx = agent.fromX + (station.approach.x - agent.fromX) * k
        agent.bz = agent.fromZ + (station.approach.z - agent.fromZ) * k
        if (k < 1) return false
        agent.station = null
        return true
      }

      case 'pick':
        agent.paper = true
        sim.carrying = action.item
        return agent.fast > 1 || agent.t >= TUNING.pickSeconds

      case 'drop': {
        agent.paper = false
        sim.carrying = null
        if (action.errandId) {
          const errands = agent.memory.errands
          const idx = errands.findIndex((e) => e.id === action.errandId)
          if (idx >= 0) {
            // Every paper for this desk is handed over in the same visit.
            const to = errands[idx]!.toEmployeeId
            for (let i = errands.length - 1; i >= 0; i -= 1) {
              if (errands[i]!.toEmployeeId !== to) continue
              this.untrack(errands[i]!)
              errands.splice(i, 1)
              this.counters.delivered += 1
            }
          }
        }
        return true
      }

      case 'wait':
        if (action.pose) sim.pose = action.pose
        return agent.fast > 1 || agent.t >= action.seconds

      case 'emote': {
        sim.pose = action.kind === 'talk' ? 'talk' : action.kind === 'wave' ? 'greet' : 'stuck'
        if (agent.fast <= 1 && agent.t < action.seconds) return false
        if (action.markAsked) agent.memory.askedQuestionId = action.markAsked
        sim.pose = 'stand'
        return true
      }

      case 'face':
        sim.heading = headingTo({ x: agent.bx, z: agent.bz }, action.toward, sim.heading)
        return true

      case 'hold':
        sim.pose = action.pose
        if (isLeisureIntent(agent.intent)) agent.dwellVisualLeft -= dt
        return false

      case 'despawn':
        agent.opacityTarget = 0
        if (sim.opacity > 0.01) return false
        sim.visible = false
        agent.gone = true
        return false

      default: {
        const exhaustive: never = action
        return exhaustive
      }
    }
  }

  /** P05-T04/T06: what is in the hand. The courier's paper wins; otherwise the desk work decides. */
  private dress(agent: Agent): void {
    agent.sim.idleKey = agent.idleKey
    agent.sim.emote = this.emoteOf(agent)
    if (agent.paper) return
    const runtime = this.state?.people[agent.id]
    agent.sim.carrying = heldItemFor(
      runtime?.activity ?? 'idle',
      runtime?.carrying ?? null,
      agent.intent.kind,
    )
  }

  /** The bubble shown while settled on an idle choice; a chatting pair takes turns. */
  private emoteOf(agent: Agent): EmoteKey | null {
    if (!agent.idleEmote || agent.plan[agent.step]?.k !== 'hold' || !isLeisureIntent(agent.intent)) return null
    if (agent.idleEmote === 'talk' && agent.partnerId) {
      const window = Math.floor(this.visualT / TUNING.idle.talkTurnSeconds) % 2
      return (window === 0) === agent.id < agent.partnerId ? 'talk' : null
    }
    return agent.idleEmote
  }

  private walkPose(agent: Agent): PoseKey {
    return agent.sim.carrying ? 'carry_walk' : 'walk'
  }

  private runWalk(agent: Agent, action: Extract<Action, { k: 'walk' }>, dt: number): boolean {
    const sim = agent.sim
    if (!agent.started) {
      agent.path = null
      agent.pathIndex = 1
      agent.teleporting = false
      const from = { x: agent.bx, z: agent.bz }
      const sameFloor = sim.floorIndex === action.floor
      const path = sameFloor ? navigate(this.gridOf(action.floor), from, action.to) : null
      if (path && path.length >= 1) {
        agent.path = path
      } else if (Math.hypot(action.to.x - from.x, action.to.z - from.z) < 0.05 && sameFloor) {
        return true
      } else {
        // R6 fallback: no path. Fade out here, fade in there, and say so once.
        agent.teleporting = true
        this.counters.teleports += 1
        const where = `${this.layout.floors[action.floor]?.key ?? action.floor}:${action.to.x.toFixed(1)},${action.to.z.toFixed(1)}`
        if (!this.warned.has(where)) {
          this.warned.add(where)
          this.warn(`[director] no path to ${where}; fade-teleporting ${agent.id}`)
        }
      }
    }

    if (agent.teleporting) {
      const fade = TUNING.fadeSeconds
      if (agent.t < fade) {
        agent.opacityTarget = 0
        return false
      }
      if (agent.opacityTarget === 0) {
        this.place(agent, action.floor, action.to)
        sim.opacity = 0
        agent.opacityTarget = 1
      }
      if (agent.t < fade * 2) return false
      agent.teleporting = false
      return true
    }

    const path = agent.path!
    let budget = TUNING.walkSpeed * agent.fast * dt
    while (budget > 0 && agent.pathIndex < path.length) {
      const target = path[agent.pathIndex]!
      const dx = target.x - agent.bx
      const dz = target.z - agent.bz
      const dist = Math.hypot(dx, dz)
      if (dist <= budget) {
        agent.bx = target.x
        agent.bz = target.z
        budget -= dist
        agent.pathIndex += 1
        if (dist > 1e-4) sim.heading = turnToward(sim.heading, Math.atan2(dx, dz), TUNING.turnRate * agent.fast * dt)
      } else {
        agent.bx += (dx / dist) * budget
        agent.bz += (dz / dist) * budget
        sim.heading = turnToward(sim.heading, Math.atan2(dx, dz), TUNING.turnRate * agent.fast * dt)
        budget = 0
      }
    }
    if (agent.pathIndex >= path.length) {
      agent.path = null
      return true
    }
    sim.pose = this.walkPose(agent)
    sim.speed01 = Math.min(1, agent.fast)
    return false
  }

  /** Straight-line move for short hops in open space (queue, car). Returns true while still moving. */
  private steer(agent: Agent, target: Vec2, speed: number, dt: number): boolean {
    const dx = target.x - agent.bx
    const dz = target.z - agent.bz
    const dist = Math.hypot(dx, dz)
    if (dist < 0.03) {
      agent.bx = target.x
      agent.bz = target.z
      return false
    }
    const step = Math.min(dist, speed * dt)
    agent.bx += (dx / dist) * step
    agent.bz += (dz / dist) * step
    agent.sim.heading = turnToward(agent.sim.heading, Math.atan2(dx, dz), TUNING.turnRate * dt)
    agent.sim.speed01 = 1
    return dist - step > 0.03
  }

  /**
   * Waiting line for a car: two files either side of the door, leaving the
   * middle lane free for people walking out.
   */
  private queueSpot(floor: FloorLayout, car: number, index: number): Vec2 {
    const door = elevatorDoorPoint(floor, car)
    const { queueSpacing, queueLane } = TUNING.elevator
    const side = index % 2 === 0 ? -1 : 1
    const rank = Math.floor(index / 2)
    return {
      x: door.x - 0.1 - (rank % 3) * queueSpacing,
      z: door.z + side * queueLane * (1 + Math.floor(rank / 3) * 0.8),
    }
  }

  private carSpot(floor: FloorLayout, car: number, place: number): Vec2 {
    const centre = elevatorDoorCentre(floor, car)
    const s = TUNING.elevator.riderSpread
    const col = place % 2
    const row = Math.floor(place / 2) % 3
    return {
      x: centre.x + TUNING.elevator.carInset + (col === 0 ? -s : s) * 0.9,
      z: centre.z + (row - 1) * s * 1.2,
    }
  }

  private fade(agent: Agent, dt: number): void {
    const sim = agent.sim
    const step = dt / TUNING.fadeSeconds
    if (sim.opacity < agent.opacityTarget) sim.opacity = Math.min(agent.opacityTarget, sim.opacity + step)
    else if (sim.opacity > agent.opacityTarget) sim.opacity = Math.max(agent.opacityTarget, sim.opacity - step)
  }

  // ───────────────────────────── light separation ─────────────────────────────

  /**
   * Walkers lean away from anyone standing or walking within reach. The lean
   * is a small visual offset on top of the path position, so it cannot jam a
   * corridor or push anyone into furniture.
   */
  private separate(dt: number): void {
    const { radius, maxOffset, gain, decay } = TUNING.separation
    const order = this.order
    for (let i = 0; i < order.length; i += 1) {
      const a = order[i]!
      const sim = a.sim
      let pushX = 0
      let pushZ = 0
      const walking = sim.speed01 > 0 && sim.visible && sim.inCar < 0
      if (walking) {
        for (let j = 0; j < order.length; j += 1) {
          if (j === i) continue
          const b = order[j]!
          if (b.sim.floorIndex !== sim.floorIndex || !b.sim.visible) continue
          if (b.station !== null || b.sim.inCar >= 0) continue
          const dx = a.bx - b.bx
          const dz = a.bz - b.bz
          const d = Math.hypot(dx, dz)
          if (d >= radius) continue
          const w = (radius - d) / radius
          if (d > 1e-3) {
            pushX += (dx / d) * w
            pushZ += (dz / d) * w
          }
          // Side-step to the right so two people meeting head-on pass each other.
          pushX += Math.cos(sim.heading) * w * 0.8
          pushZ += -Math.sin(sim.heading) * w * 0.8
        }
      }
      const len = Math.hypot(pushX, pushZ)
      const scale = len > 1e-6 ? Math.min(maxOffset, len * gain * maxOffset) / len : 0
      const k = Math.min(1, decay * dt)
      let offX = a.offX + (pushX * scale - a.offX) * k
      let offZ = a.offZ + (pushZ * scale - a.offZ) * k
      if (offX !== 0 || offZ !== 0) {
        const grid = this.gridOf(sim.floorIndex)
        const [col, row] = grid.toCell({ x: a.bx + offX, z: a.bz + offZ })
        if (walking && grid.isBlocked(col, row)) {
          offX = a.offX * (1 - k)
          offZ = a.offZ * (1 - k)
        }
      }
      a.offX = Math.abs(offX) < 1e-4 ? 0 : offX
      a.offZ = Math.abs(offZ) < 1e-4 ? 0 : offZ
      sim.x = a.bx + a.offX
      sim.z = a.bz + a.offZ
    }
  }
}

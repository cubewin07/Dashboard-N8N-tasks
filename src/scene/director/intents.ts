import type { RoleDef } from '@/domain/config'
import type { EmployeeId, HelpId, QuestionId } from '@/domain/primitives'
import type { HelpRequest, OfficeState, PersonRuntime, Question } from '@/domain/work'
import type { BuildingLayout } from '@/scene/layout'
import type { PoseKey } from './poses'
import type { Errand, VerticalMode } from './types'

/**
 * What a person is trying to do (§3.3). The planner turns an intent into
 * steps; the vertical mode is fixed per kind (R5), never chosen by distance.
 */
export type Intent =
  | { kind: 'WorkAtDesk'; pose: PoseKey }
  | { kind: 'ReviewAtDesk'; reviewId: string | null }
  | { kind: 'GoToDesk' }
  | { kind: 'ReturnToDesk' }
  | { kind: 'DeliverDocument'; errandId: string; toEmployeeId: EmployeeId; reviewId: string | null; taskId: string | null }
  | { kind: 'GoAsk'; toEmployeeId: EmployeeId; questionId: QuestionId }
  | { kind: 'WaitInSeat'; nearEmployeeId: EmployeeId; questionId: QuestionId }
  | { kind: 'HelpAt'; helperId: EmployeeId; helpId: HelpId }
  | { kind: 'MeetAt' }
  | { kind: 'Arrive' }
  | { kind: 'Leave' }
  | { kind: 'IdleAtDesk' }
  | { kind: 'IdleWander'; floorKey: string; slotId: string }
  | { kind: 'RestOnLeisureFloor'; floorKey: string; slotId: string }
  | { kind: 'NapAtDesk' }

export type IntentKind = Intent['kind']

export const INTENT_KINDS: readonly IntentKind[] = [
  'WorkAtDesk',
  'ReviewAtDesk',
  'GoToDesk',
  'ReturnToDesk',
  'DeliverDocument',
  'GoAsk',
  'WaitInSeat',
  'HelpAt',
  'MeetAt',
  'Arrive',
  'Leave',
  'IdleAtDesk',
  'IdleWander',
  'RestOnLeisureFloor',
  'NapAtDesk',
]

/**
 * R5: elevators carry work trips only; leisure trips between floors take the
 * stairs. `null` = the intent never changes floor.
 */
export const INTENT_VERTICAL_MODE: Record<IntentKind, VerticalMode | null> = {
  WorkAtDesk: null,
  ReviewAtDesk: null,
  GoToDesk: 'elevator',
  ReturnToDesk: 'elevator',
  DeliverDocument: 'elevator',
  GoAsk: 'elevator',
  WaitInSeat: 'elevator',
  HelpAt: 'elevator',
  MeetAt: 'elevator',
  Arrive: 'elevator',
  Leave: 'elevator',
  IdleAtDesk: 'stairs',
  IdleWander: 'stairs',
  RestOnLeisureFloor: 'stairs',
  NapAtDesk: 'stairs',
}

/** R4: the only intents that wander or go to a leisure floor. */
export const LEISURE_INTENTS: ReadonlySet<IntentKind> = new Set<IntentKind>([
  'IdleAtDesk',
  'IdleWander',
  'RestOnLeisureFloor',
  'NapAtDesk',
])

export function isLeisureIntent(intent: Intent): boolean {
  return LEISURE_INTENTS.has(intent.kind)
}

export function intentKey(intent: Intent): string {
  switch (intent.kind) {
    case 'WorkAtDesk':
      return `WorkAtDesk:${intent.pose}`
    case 'ReviewAtDesk':
      return 'ReviewAtDesk'
    case 'DeliverDocument':
      return `DeliverDocument:${intent.errandId}`
    case 'GoAsk':
      return `GoAsk:${intent.questionId}`
    case 'WaitInSeat':
      return `WaitInSeat:${intent.questionId}`
    case 'HelpAt':
      return `HelpAt:${intent.helpId}:${intent.helperId}`
    case 'IdleWander':
    case 'RestOnLeisureFloor':
      return `${intent.kind}:${intent.floorKey}:${intent.slotId}`
    default:
      return intent.kind
  }
}

/**
 * What the director remembers about one person between ticks. `deriveIntent`
 * only reads it.
 */
export interface PersonMemory {
  /** Seated at the own desk right now. */
  atDesk: boolean
  /** Left the desk on a work trip and has not come back yet. */
  awayOnWork: boolean
  /** Hired during this session and still on the way in from the lobby. */
  arriving: boolean
  /** Archived: walking out. */
  leaving: boolean
  /** Papers still to carry, oldest first (from events, not from `activity`). */
  errands: readonly Errand[]
  /** The idle brain's current choice (null → stay at the desk). */
  idleChoice: Intent | null
  /** Where this person spends lunch / the night (null → nap at the desk). */
  restChoice: Intent | null
  /** The question whose face-to-face chat already happened. */
  askedQuestionId: string | null
}

export function emptyMemory(): PersonMemory {
  return {
    atDesk: true,
    awayOnWork: false,
    arriving: false,
    leaving: false,
    errands: [],
    idleChoice: null,
    restChoice: null,
    askedQuestionId: null,
  }
}

interface AskIndex {
  questionByFrom: Map<EmployeeId, Question>
  helpByFrom: Map<EmployeeId, HelpRequest>
}

const askIndexCache = new WeakMap<object, WeakMap<object, AskIndex>>()

/** Open questions / help requests by asker, cached on the state slices' identity. */
function askIndex(state: OfficeState): AskIndex {
  let byHelp = askIndexCache.get(state.questions)
  if (!byHelp) {
    byHelp = new WeakMap()
    askIndexCache.set(state.questions, byHelp)
  }
  let index = byHelp.get(state.help)
  if (!index) {
    index = { questionByFrom: new Map(), helpByFrom: new Map() }
    for (const q of Object.values(state.questions)) {
      if (q.status !== 'open') continue
      const prev = index.questionByFrom.get(q.fromId)
      if (!prev || q.createdAt > prev.createdAt) index.questionByFrom.set(q.fromId, q)
    }
    for (const h of Object.values(state.help)) {
      if (h.status !== 'open' && h.status !== 'accepted' && h.status !== 'timed_out') continue
      const prev = index.helpByFrom.get(h.fromId)
      if (!prev || h.createdAt > prev.createdAt) index.helpByFrom.set(h.fromId, h)
    }
    byHelp.set(state.help, index)
  }
  return index
}

const roleCache = new WeakMap<object, Map<string, RoleDef>>()

function roleOf(state: OfficeState, id: EmployeeId): RoleDef | null {
  const emp = employeeIndex(state).get(id)
  if (!emp) return null
  let roles = roleCache.get(state.config.roles)
  if (!roles) {
    roles = new Map(state.config.roles.map((r) => [r.key, r]))
    roleCache.set(state.config.roles, roles)
  }
  return roles.get(emp.roleKey) ?? null
}

const employeeCache = new WeakMap<object, Map<EmployeeId, OfficeState['config']['employees'][number]>>()

export function employeeIndex(
  state: OfficeState,
): Map<EmployeeId, OfficeState['config']['employees'][number]> {
  let index = employeeCache.get(state.config.employees)
  if (!index) {
    index = new Map(state.config.employees.map((e) => [e.id, e]))
    employeeCache.set(state.config.employees, index)
  }
  return index
}

export function isOwner(state: OfficeState, id: EmployeeId): boolean {
  return roleOf(state, id)?.caps.humanOwner === true
}

/** The other person is in the building (seated by the layout, or at least on the payroll). */
function hasPlace(state: OfficeState, layout: BuildingLayout, id: EmployeeId): boolean {
  return layout.seatOf[id] !== undefined || state.people[id] !== undefined
}

function atDeskOr(memory: PersonMemory, settled: Intent): Intent {
  return memory.atDesk ? settled : { kind: 'GoToDesk' }
}

/**
 * The intents table of §3.3 as a pure function. `layout` decides whether the
 * people a trip depends on have a place in the building at all.
 */
export function deriveIntent(
  person: PersonRuntime,
  state: OfficeState,
  layout: BuildingLayout,
  memory: PersonMemory,
): Intent {
  if (memory.leaving) return { kind: 'Leave' }
  if (memory.arriving) return { kind: 'Arrive' }

  // Owners sit at the boss desk; they do not wander or run errands in P04.
  if (isOwner(state, person.employeeId)) {
    return { kind: 'WorkAtDesk', pose: 'sit_work' }
  }

  // A paper to carry outranks whatever the state says now (§3.6 rule 1): the
  // event already happened, the legs still owe the trip.
  const errand = memory.errands[0]
  if (errand) {
    return {
      kind: 'DeliverDocument',
      errandId: errand.id,
      toEmployeeId: errand.toEmployeeId,
      reviewId: errand.reviewId,
      taskId: errand.taskId,
    }
  }

  const activity = person.activity
  switch (activity) {
    case 'working': {
      const task = person.taskId ? state.tasks[person.taskId] : undefined
      return atDeskOr(memory, {
        kind: 'WorkAtDesk',
        pose: task?.status === 'blocked' ? 'stuck' : 'sit_work',
      })
    }
    case 'reviewing':
      return atDeskOr(memory, { kind: 'ReviewAtDesk', reviewId: null })
    case 'delivering':
      // The paper itself is an errand (handled above). Without one the trip
      // is over or was collapsed: go back.
      return atDeskOr(memory, { kind: 'WorkAtDesk', pose: 'sit_work' })
    case 'asking': {
      const q = askIndex(state).questionByFrom.get(person.employeeId)
      if (
        q &&
        !q.inPerson &&
        q.toId !== person.employeeId &&
        memory.askedQuestionId !== q.id &&
        hasPlace(state, layout, q.toId)
      ) {
        return { kind: 'GoAsk', toEmployeeId: q.toId, questionId: q.id }
      }
      return atDeskOr(memory, { kind: 'WorkAtDesk', pose: 'wait_seat' })
    }
    case 'waiting_answer': {
      const index = askIndex(state)
      const q = index.questionByFrom.get(person.employeeId)
      if (q && q.inPerson && q.toId !== person.employeeId && hasPlace(state, layout, q.toId)) {
        return { kind: 'WaitInSeat', nearEmployeeId: q.toId, questionId: q.id }
      }
      const help = index.helpByFrom.get(person.employeeId)
      if (help && help.toId && help.toId !== person.employeeId && hasPlace(state, layout, help.toId)) {
        return { kind: 'HelpAt', helperId: help.toId, helpId: help.id }
      }
      return atDeskOr(memory, { kind: 'WorkAtDesk', pose: 'wait_seat' })
    }
    case 'helping':
      return atDeskOr(memory, { kind: 'WorkAtDesk', pose: 'talk' })
    case 'in_meeting':
      return { kind: 'MeetAt' }
    case 'idle':
      if (memory.awayOnWork && !memory.atDesk) return { kind: 'ReturnToDesk' }
      return memory.idleChoice ?? { kind: 'IdleAtDesk' }
    case 'resting':
    case 'off_shift':
      if (memory.awayOnWork && !memory.atDesk) return { kind: 'ReturnToDesk' }
      return memory.restChoice ?? { kind: 'NapAtDesk' }
    default: {
      const exhaustive: never = activity
      return exhaustive
    }
  }
}

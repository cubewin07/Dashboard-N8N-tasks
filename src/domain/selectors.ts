import type {
  ApprovalRule,
  Department,
  Employee,
  OrgConfig,
  RoleDef,
  Specialty,
} from './config'
import type { EventType, OfficeEvent } from './events'
import type {
  ApprovalLevel,
  DepartmentId,
  EmployeeId,
  EventId,
  Iso,
  Label,
  Priority,
  QuestionId,
  ReviewId,
  TaskId,
} from './primitives'
import { effectivePriority, sortQueue } from './queue'
import { requiredLevel } from './rules'
import type {
  OfficeState,
  PersonRuntime,
  Question,
  ReviewDecision,
  ReviewItem,
  Task,
} from './work'

export interface OrgPersonNode {
  employee: Employee
  role: RoleDef
  specialties: Specialty[]
}

export interface OrgFloorNode {
  floorKey: string
  floorNumber: number
  kind: 'boss' | 'management' | 'department'
  label: Label
  colorSwatch: string
  hours: 'office' | '24_7'
  department: Department | null
  people: OrgPersonNode[]
}

const BOSS_FLOOR_LABEL: Label = {
  vi: 'Phòng Giám đốc',
  en: 'Executive Suite',
}

const MANAGEMENT_FLOOR_LABEL: Label = {
  vi: 'Điều hành & Quản lý',
  en: 'Management Office',
}

export function sortEmployeesByRole(
  employees: Employee[],
  roleMap: ReadonlyMap<string, RoleDef>,
): Employee[] {
  return [...employees].sort((a, b) => {
    const orderA = roleMap.get(a.roleKey)?.sortOrder ?? 999
    const orderB = roleMap.get(b.roleKey)?.sortOrder ?? 999
    if (orderA !== orderB) return orderA - orderB
    const createdCmp = a.createdAt.localeCompare(b.createdAt)
    if (createdCmp !== 0) return createdCmp
    return a.id.localeCompare(b.id)
  })
}

export function peopleByDepartment(
  config: OrgConfig,
): Record<DepartmentId | 'building', Employee[]> {
  const roleMap = new Map(config.roles.map((r) => [r.key, r]))
  const grouped: Record<string, Employee[]> = { building: [] }

  for (const dept of config.departments) {
    grouped[dept.id] = []
  }

  for (const emp of config.employees) {
    if (emp.state !== 'active') continue
    const key = emp.departmentId ?? 'building'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(emp)
  }

  for (const key of Object.keys(grouped)) {
    grouped[key] = sortEmployeesByRole(grouped[key]!, roleMap)
  }

  return grouped as Record<DepartmentId | 'building', Employee[]>
}

/**
 * Builds the company organisation tree ordered top floor -> bottom floor
 * (Boss floor first, then Management, then active departments in reverse floor order).
 */
export function orgTree(config: OrgConfig): OrgFloorNode[] {
  const roleMap = new Map(config.roles.map((r) => [r.key, r]))
  const specialtyMap = new Map(config.specialties.map((s) => [s.key, s]))
  const activeDeptsAsc = [...config.departments]
    .filter((d) => d.active)
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))

  const toPersonNode = (emp: Employee): OrgPersonNode => {
    const role = roleMap.get(emp.roleKey) ?? {
      key: emp.roleKey,
      label: { vi: emp.roleKey, en: emp.roleKey },
      scope: emp.departmentId ? 'department' : 'building',
      caps: {
        assignTasks: false,
        approveLevel: null,
        distributeReviews: false,
        answerQuestions: false,
        doWork: true,
        humanOwner: false,
      },
      modelTier: 'standard',
      maxPerDepartment: null,
      workspace: 'desk',
      sortOrder: 999,
    }
    const specialties = emp.specialties
      .map((sKey) => specialtyMap.get(sKey))
      .filter((s): s is Specialty => s !== undefined)
    return { employee: emp, role, specialties }
  }

  type RawFloor =
    | { kind: 'fixed'; key: 'lobby_cafe' | 'games_rest' | 'management' }
    | { kind: 'department'; department: Department }
    | { kind: 'boss' }

  const bottomUp: RawFloor[] = []
  for (const entry of config.building.stack) {
    if (entry.kind === 'fixed') {
      bottomUp.push({ kind: 'fixed', key: entry.key })
    } else if (entry.kind === 'departments') {
      for (const dept of activeDeptsAsc) {
        bottomUp.push({ kind: 'department', department: dept })
      }
    }
  }
  bottomUp.push({ kind: 'boss' })

  const byDept = peopleByDepartment(config)
  const buildingPeople = byDept.building ?? []

  const ownerPeople = buildingPeople
    .filter((e) => roleMap.get(e.roleKey)?.caps.humanOwner === true)
    .map(toPersonNode)
  const managerPeople = buildingPeople
    .filter((e) => roleMap.get(e.roleKey)?.caps.humanOwner !== true)
    .map(toPersonNode)

  const floorsBottomUp: OrgFloorNode[] = []
  bottomUp.forEach((raw, idx) => {
    const floorNumber = idx + 1
    if (raw.kind === 'boss') {
      floorsBottomUp.push({
        floorKey: 'boss',
        floorNumber,
        kind: 'boss',
        label: BOSS_FLOOR_LABEL,
        colorSwatch: 'boss',
        hours: 'office',
        department: null,
        people: ownerPeople,
      })
    } else if (raw.kind === 'fixed' && raw.key === 'management') {
      floorsBottomUp.push({
        floorKey: 'management',
        floorNumber,
        kind: 'management',
        label: MANAGEMENT_FLOOR_LABEL,
        colorSwatch: 'management',
        hours: 'office',
        department: null,
        people: managerPeople,
      })
    } else if (raw.kind === 'department') {
      const dept = raw.department
      const people = (byDept[dept.id] ?? []).map(toPersonNode)
      floorsBottomUp.push({
        floorKey: dept.key,
        floorNumber,
        kind: 'department',
        label: dept.label,
        colorSwatch: dept.colorSwatch,
        hours: dept.hours,
        department: dept,
        people,
      })
    }
  })

  return floorsBottomUp.reverse()
}

// ============================================================================
// Runtime Selectors (with slice-keyed memoisation)
// ============================================================================

interface BossQueueItemBase {
  priority: Priority
  effectivePriority: number
  createdAt: Iso
  taskId: TaskId
  task: Task | null
  department: Department | null
  requester: Employee | null
  assignee: Employee | null
  matchedRules: ApprovalRule[]
}

export type BossQueueItem =
  | (BossQueueItemBase & {
      id: ReviewId
      kind: 'review'
      review: ReviewItem
      question: null
    })
  | (BossQueueItemBase & {
      id: QuestionId
      kind: 'question'
      review: null
      question: Question
    })

export interface FloorSummary {
  floorKey: string
  working: number
  waiting: number
  reviewPile: number
  idle: number
  headcount: number
}

export interface WhyLevelResult {
  level: ApprovalLevel
  matchedRuleIds: string[]
  matchedRules: ApprovalRule[]
  isDefault: boolean
}

export type ActivityCategory =
  | 'work'
  | 'review'
  | 'help_question'
  | 'staff'
  | 'system'

export interface ActivitySentenceParts {
  eventId: EventId
  type: EventType
  at: Iso
  category: ActivityCategory
  departmentId: DepartmentId | null
  floorKey: string | null
  actorId: EmployeeId | null
  actorName: string
  targetId: EmployeeId | null
  targetName: string | null
  taskId: TaskId | null
  taskTitle: string | null
  platformKey: string | null
  shopName: string | null
  decision: ReviewDecision | null
  level: ApprovalLevel | null
  reason: string | null
  progressPercent: number | null
  scenarioLabel: Label | null
  slots: Record<string, string | number>
}

interface StateSelectorCache {
  now: Iso
  reviews: OfficeState['reviews']
  tasks: OfficeState['tasks']
  questions: OfficeState['questions']
  people: OfficeState['people']
  config: OrgConfig
  piles: Map<EmployeeId, ReviewItem[]>
  waitingSeats: Map<EmployeeId, Question[]>
  queues: Map<EmployeeId, Task[]>
  bossQueue?: BossQueueItem[]
  floorSummaries: Map<string, FloorSummary>
  idlePeople?: PersonRuntime[]
  tempStaff?: Employee[]
  whyLevels: Map<TaskId, WhyLevelResult>
}

let lastSelectorCache: StateSelectorCache | null = null

function getSelectorCache(state: OfficeState): StateSelectorCache {
  if (
    lastSelectorCache &&
    lastSelectorCache.now === state.now &&
    lastSelectorCache.reviews === state.reviews &&
    lastSelectorCache.tasks === state.tasks &&
    lastSelectorCache.questions === state.questions &&
    lastSelectorCache.people === state.people &&
    lastSelectorCache.config === state.config
  ) {
    return lastSelectorCache
  }
  lastSelectorCache = {
    now: state.now,
    reviews: state.reviews,
    tasks: state.tasks,
    questions: state.questions,
    people: state.people,
    config: state.config,
    piles: new Map(),
    waitingSeats: new Map(),
    queues: new Map(),
    floorSummaries: new Map(),
    whyLevels: new Map(),
  }
  return lastSelectorCache
}

function resolveStateAndArg<T>(
  a: OfficeState | T,
  b: OfficeState | T,
): [OfficeState, T] {
  if (typeof a === 'object' && a !== null && 'schema' in a) {
    return [a as OfficeState, b as T]
  }
  return [b as OfficeState, a as T]
}

export function pileFor(state: OfficeState, employeeId: EmployeeId): ReviewItem[]
export function pileFor(employeeId: EmployeeId, state: OfficeState): ReviewItem[]
export function pileFor(
  a: OfficeState | EmployeeId,
  b: OfficeState | EmployeeId,
): ReviewItem[] {
  const [state, employeeId] = resolveStateAndArg<EmployeeId>(a, b)
  const cache = getSelectorCache(state)
  const cached = cache.piles.get(employeeId)
  if (cached) return cached

  const pending = Object.values(state.reviews).filter(
    (r) =>
      r.assigneeId === employeeId &&
      (r.status === 'pending' || r.status === 'in_review'),
  )
  const sorted = sortQueue(pending, state.now, state.config.policy)
  cache.piles.set(employeeId, sorted)
  return sorted
}

export function waitingSeatsFor(
  state: OfficeState,
  employeeId: EmployeeId,
): Question[]
export function waitingSeatsFor(
  employeeId: EmployeeId,
  state: OfficeState,
): Question[]
export function waitingSeatsFor(
  a: OfficeState | EmployeeId,
  b: OfficeState | EmployeeId,
): Question[] {
  const [state, employeeId] = resolveStateAndArg<EmployeeId>(a, b)
  const cache = getSelectorCache(state)
  const cached = cache.waitingSeats.get(employeeId)
  if (cached) return cached

  const waiting = Object.values(state.questions)
    .filter(
      (q) =>
        q.toId === employeeId && q.status === 'open' && q.inPerson === true,
    )
    .sort((x, y) => {
      const cmp = x.createdAt.localeCompare(y.createdAt)
      if (cmp !== 0) return cmp
      return x.id < y.id ? -1 : x.id > y.id ? 1 : 0
    })
  cache.waitingSeats.set(employeeId, waiting)
  return waiting
}

export function queueFor(state: OfficeState, employeeId: EmployeeId): Task[]
export function queueFor(employeeId: EmployeeId, state: OfficeState): Task[]
export function queueFor(
  a: OfficeState | EmployeeId,
  b: OfficeState | EmployeeId,
): Task[] {
  const [state, employeeId] = resolveStateAndArg<EmployeeId>(a, b)
  const cache = getSelectorCache(state)
  const cached = cache.queues.get(employeeId)
  if (cached) return cached

  const tasks = Object.values(state.tasks).filter(
    (t) =>
      t.assigneeId === employeeId &&
      (t.status === 'queued' ||
        t.status === 'in_progress' ||
        t.status === 'waiting_help' ||
        t.status === 'waiting_answer' ||
        t.status === 'blocked'),
  )
  const sorted = sortQueue(tasks, state.now, state.config.policy)
  cache.queues.set(employeeId, sorted)
  return sorted
}

export function whyLevel(state: OfficeState, taskId: TaskId): WhyLevelResult
export function whyLevel(taskId: TaskId, state: OfficeState): WhyLevelResult
export function whyLevel(
  a: OfficeState | TaskId,
  b: OfficeState | TaskId,
): WhyLevelResult {
  const [state, taskId] = resolveStateAndArg<TaskId>(a, b)
  const cache = getSelectorCache(state)
  const cached = cache.whyLevels.get(taskId)
  if (cached) return cached

  const task = state.tasks[taskId]
  if (!task) {
    const fallback: WhyLevelResult = {
      level: state.config.policy.approvals.defaultLevel,
      matchedRuleIds: [],
      matchedRules: [],
      isDefault: true,
    }
    cache.whyLevels.set(taskId, fallback)
    return fallback
  }

  const ruleMap = new Map(state.config.approvalRules.map((r) => [r.id, r]))
  let ruleIds = task.matchedRuleIds
  let level = task.requiredLevel

  if (ruleIds.length === 0) {
    const evaluated = requiredLevel(
      task,
      state.config.approvalRules,
      state.config.policy,
    )
    if (evaluated.matchedRuleIds.length > 0) {
      ruleIds = evaluated.matchedRuleIds
      level = evaluated.level
    }
  }

  const matchedRules = ruleIds
    .map((id) => ruleMap.get(id))
    .filter((r): r is ApprovalRule => r !== undefined)

  const res: WhyLevelResult = {
    level,
    matchedRuleIds: ruleIds,
    matchedRules,
    isDefault: matchedRules.length === 0,
  }
  cache.whyLevels.set(taskId, res)
  return res
}

export function bossQueue(state: OfficeState): BossQueueItem[] {
  const cache = getSelectorCache(state)
  if (cache.bossQueue) return cache.bossQueue

  const roleMap = new Map(state.config.roles.map((r) => [r.key, r]))
  const empMap = new Map(state.config.employees.map((e) => [e.id, e]))
  const deptMap = new Map(state.config.departments.map((d) => [d.id, d]))

  const ownerIds = new Set<EmployeeId>(
    state.config.employees
      .filter((e) => {
        const r = roleMap.get(e.roleKey)
        return r?.caps.humanOwner === true || r?.caps.approveLevel === 'boss'
      })
      .map((e) => e.id),
  )

  const items: BossQueueItem[] = []

  for (const rev of Object.values(state.reviews)) {
    if (rev.status !== 'pending' && rev.status !== 'in_review') continue
    if (rev.level !== 'boss' && !ownerIds.has(rev.assigneeId)) continue

    const task = state.tasks[rev.taskId] ?? null
    const dept = task ? (deptMap.get(task.departmentId) ?? null) : null
    const requester =
      task?.assigneeId
        ? (empMap.get(task.assigneeId) ?? null)
        : task?.requestedBy.id
          ? (empMap.get(task.requestedBy.id as EmployeeId) ?? null)
          : null
    const assignee = empMap.get(rev.assigneeId) ?? null
    const why = task ? whyLevel(state, task.id) : null
    const eff = effectivePriority(rev, state.now, state.config.policy)

    items.push({
      id: rev.id,
      kind: 'review',
      priority: rev.priority,
      effectivePriority: eff,
      createdAt: rev.createdAt,
      taskId: rev.taskId,
      task,
      department: dept,
      requester,
      assignee,
      review: rev,
      question: null,
      matchedRules: why?.matchedRules ?? [],
    })
  }

  for (const q of Object.values(state.questions)) {
    if (q.status !== 'open') continue
    if (!ownerIds.has(q.toId)) continue

    const task = state.tasks[q.taskId] ?? null
    const priority: Priority = task?.priority ?? 'normal'
    const dept = task ? (deptMap.get(task.departmentId) ?? null) : null
    const requester = empMap.get(q.fromId) ?? null
    const assignee = empMap.get(q.toId) ?? null
    const why = task ? whyLevel(state, task.id) : null
    const eff = effectivePriority(
      { priority, createdAt: q.createdAt },
      state.now,
      state.config.policy,
    )

    items.push({
      id: q.id,
      kind: 'question',
      priority,
      effectivePriority: eff,
      createdAt: q.createdAt,
      taskId: q.taskId,
      task,
      department: dept,
      requester,
      assignee,
      review: null,
      question: q,
      matchedRules: why?.matchedRules ?? [],
    })
  }

  const sorted = sortQueue(items, state.now, state.config.policy)
  cache.bossQueue = sorted
  return sorted
}

export function floorSummary(state: OfficeState, floorKey: string): FloorSummary
export function floorSummary(floorKey: string, state: OfficeState): FloorSummary
export function floorSummary(
  a: OfficeState | string,
  b: OfficeState | string,
): FloorSummary {
  const [state, floorKey] = resolveStateAndArg<string>(a, b)
  const cache = getSelectorCache(state)
  const cached = cache.floorSummaries.get(floorKey)
  if (cached) return cached

  const roleMap = new Map(state.config.roles.map((r) => [r.key, r]))
  const baseKey = floorKey.split('#')[0] ?? floorKey

  let floorEmployees: Employee[]
  let dept: Department | null = null

  if (baseKey === 'boss') {
    floorEmployees = state.config.employees.filter(
      (e) =>
        e.state === 'active' &&
        roleMap.get(e.roleKey)?.caps.humanOwner === true,
    )
  } else if (baseKey === 'management') {
    floorEmployees = state.config.employees.filter(
      (e) =>
        e.state === 'active' &&
        e.departmentId === null &&
        roleMap.get(e.roleKey)?.caps.humanOwner !== true,
    )
  } else {
    dept =
      state.config.departments.find(
        (d) => d.key === baseKey || d.id === baseKey,
      ) ?? null
    if (dept) {
      floorEmployees = state.config.employees.filter(
        (e) => e.state === 'active' && e.departmentId === dept!.id,
      )
    } else {
      // Leisure floors (lobby_cafe, games_rest): count anyone whose locationHint is on this floor
      floorEmployees = state.config.employees.filter(
        (e) =>
          e.state === 'active' &&
          state.people[e.id]?.location?.floorKey === floorKey,
      )
    }
  }

  const floorEmpIds = new Set<EmployeeId>(floorEmployees.map((e) => e.id))

  let working = 0
  let waitingPeople = 0
  let idle = 0

  for (const emp of floorEmployees) {
    const runtime = state.people[emp.id]
    const act = runtime?.activity ?? 'idle'
    if (
      act === 'working' ||
      act === 'reviewing' ||
      act === 'delivering' ||
      act === 'helping' ||
      act === 'in_meeting'
    ) {
      working += 1
    } else if (act === 'asking' || act === 'waiting_answer') {
      waitingPeople += 1
    } else {
      idle += 1
    }
  }

  let queuedTasks = 0
  if (dept) {
    for (const task of Object.values(state.tasks)) {
      if (
        task.departmentId === dept.id &&
        (task.status === 'queued' || task.status === 'blocked')
      ) {
        queuedTasks += 1
      }
    }
  } else if (baseKey === 'management') {
    for (const task of Object.values(state.tasks)) {
      if (task.status === 'queued' && task.assigneeId === null) {
        queuedTasks += 1
      }
    }
  }

  let reviewPile = 0
  for (const rev of Object.values(state.reviews)) {
    if (rev.status !== 'pending' && rev.status !== 'in_review') continue
    if (floorEmpIds.has(rev.assigneeId)) {
      reviewPile += 1
    } else if (baseKey === 'boss' && rev.level === 'boss') {
      reviewPile += 1
    }
  }

  const summary: FloorSummary = {
    floorKey,
    working,
    waiting: waitingPeople + queuedTasks,
    reviewPile,
    idle,
    headcount: floorEmployees.length,
  }
  cache.floorSummaries.set(floorKey, summary)
  return summary
}

export function idlePeople(state: OfficeState): PersonRuntime[] {
  const cache = getSelectorCache(state)
  if (cache.idlePeople) return cache.idlePeople

  const list = Object.values(state.people)
    .filter((p) => p.activity === 'idle')
    .sort((a, b) => {
      const aTime = a.idleSince ?? a.lastActiveAt
      const bTime = b.idleSince ?? b.lastActiveAt
      const cmp = aTime.localeCompare(bTime)
      if (cmp !== 0) return cmp
      return a.employeeId < b.employeeId
        ? -1
        : a.employeeId > b.employeeId
          ? 1
          : 0
    })

  cache.idlePeople = list
  return list
}

export function tempStaff(state: OfficeState): Employee[] {
  const cache = getSelectorCache(state)
  if (cache.tempStaff) return cache.tempStaff

  const list = state.config.employees
    .filter((e) => e.kind === 'temp' && e.state === 'active')
    .sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt)
      if (cmp !== 0) return cmp
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

  cache.tempStaff = list
  return list
}

export function archivedStaff(state: OfficeState): Employee[] {
  return state.config.employees
    .filter((e) => e.state === 'archived')
    .sort((a, b) => {
      const aTime = a.archivedAt ?? a.createdAt
      const bTime = b.archivedAt ?? b.createdAt
      const cmp = bTime.localeCompare(aTime)
      if (cmp !== 0) return cmp
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
}

export function activitySentenceParts(
  event: OfficeEvent,
  state: OfficeState,
): ActivitySentenceParts
export function activitySentenceParts(
  state: OfficeState,
  event: OfficeEvent,
): ActivitySentenceParts
export function activitySentenceParts(
  a: OfficeEvent | OfficeState,
  b: OfficeEvent | OfficeState,
): ActivitySentenceParts {
  const [state, event] =
    'schema' in a
      ? [a as OfficeState, b as OfficeEvent]
      : [b as OfficeState, a as OfficeEvent]

  const empMap = new Map(state.config.employees.map((e) => [e.id, e]))
  const deptMap = new Map(state.config.departments.map((d) => [d.id, d]))
  const shopMap = new Map(state.config.shops.map((s) => [s.id, s]))

  const nameOf = (id: string | null | undefined, fallback = 'Hệ thống'): string => {
    if (!id) return fallback
    const emp = empMap.get(id as EmployeeId)
    return emp ? emp.name : id
  }

  const floorKeyOfEmp = (id: EmployeeId | null | undefined): string | null => {
    if (!id) return null
    const emp = empMap.get(id)
    if (!emp) return null
    if (emp.departmentId) {
      return deptMap.get(emp.departmentId)?.key ?? null
    }
    const role = state.config.roles.find((r) => r.key === emp.roleKey)
    return role?.caps.humanOwner ? 'boss' : 'management'
  }

  let category: ActivityCategory = 'work'
  let departmentId: DepartmentId | null = null
  let floorKey: string | null = null
  let actorId: EmployeeId | null =
    event.actor.kind === 'employee' || event.actor.kind === 'owner'
      ? (event.actor.id as EmployeeId | null)
      : null
  let actorName =
    event.actor.kind === 'customer'
      ? 'Khách hàng'
      : event.actor.kind === 'owner'
        ? nameOf(event.actor.id, 'Sếp')
        : nameOf(event.actor.id, 'Hệ thống')
  let targetId: EmployeeId | null = null
  let targetName: string | null = null
  let taskId: TaskId | null = null
  let taskTitle: string | null = null
  let platformKey: string | null = null
  let shopName: string | null = null
  let decision: ReviewDecision | null = null
  let level: ApprovalLevel | null = null
  let reason: string | null = null
  let progressPercent: number | null = null
  let scenarioLabel: Label | null = null
  let specialtyKey = ''
  let channelKey = ''
  let activityKey = ''

  const hydrateFromTask = (t: Task | undefined) => {
    if (!t) return
    taskId = t.id
    taskTitle = t.title
    departmentId = t.departmentId
    floorKey = deptMap.get(t.departmentId)?.key ?? floorKey
    platformKey = t.platformKey
    shopName = t.shopId ? (shopMap.get(t.shopId as never)?.name ?? null) : null
  }

  switch (event.type) {
    case 'intake.received': {
      const p = event.payload as OfficeEvent<'intake.received'>['payload']
      category = 'work'
      floorKey = 'management'
      actorName = 'Sếp'
      taskTitle = p.text
      channelKey = p.channel
      break
    }
    case 'task.created': {
      const p = event.payload as OfficeEvent<'task.created'>['payload']
      category = 'work'
      hydrateFromTask(p.task)
      if (!actorId && p.task.assigneeId) {
        actorId = p.task.assigneeId
        actorName = nameOf(p.task.assigneeId)
      }
      break
    }
    case 'task.assigned': {
      const p = event.payload as OfficeEvent<'task.assigned'>['payload']
      category = 'work'
      hydrateFromTask(state.tasks[p.taskId])
      actorId = p.byId as EmployeeId
      actorName = nameOf(p.byId)
      targetId = p.assigneeId
      targetName = nameOf(p.assigneeId)
      break
    }
    case 'task.started':
    case 'task.completed': {
      const p = event.payload as OfficeEvent<'task.started'>['payload']
      category = 'work'
      const task = state.tasks[p.taskId]
      hydrateFromTask(task)
      if (task?.assigneeId) {
        actorId = task.assigneeId
        actorName = nameOf(task.assigneeId)
      }
      break
    }
    case 'task.progressed': {
      const p = event.payload as OfficeEvent<'task.progressed'>['payload']
      category = 'work'
      const task = state.tasks[p.taskId]
      hydrateFromTask(task)
      progressPercent = Math.round(p.progress * 100)
      if (task?.assigneeId) {
        actorId = task.assigneeId
        actorName = nameOf(task.assigneeId)
      }
      break
    }
    case 'task.handed_off': {
      const p = event.payload as OfficeEvent<'task.handed_off'>['payload']
      category = 'work'
      hydrateFromTask(state.tasks[p.taskId])
      actorId = p.fromId
      actorName = nameOf(p.fromId)
      targetId = p.toId
      targetName = nameOf(p.toId)
      break
    }
    case 'task.reprioritised': {
      const p = event.payload as OfficeEvent<'task.reprioritised'>['payload']
      category = 'work'
      hydrateFromTask(state.tasks[p.taskId])
      reason = p.priority
      break
    }
    case 'task.blocked':
    case 'task.cancelled':
    case 'task.failed': {
      const p = event.payload as OfficeEvent<'task.blocked'>['payload']
      category = 'work'
      const task = state.tasks[p.taskId]
      hydrateFromTask(task)
      reason = p.reason
      if (!actorId && task?.assigneeId) {
        actorId = task.assigneeId
        actorName = nameOf(task.assigneeId)
      }
      break
    }
    case 'review.requested': {
      const p = event.payload as OfficeEvent<'review.requested'>['payload']
      category = 'review'
      const task = state.tasks[p.review.taskId]
      hydrateFromTask(task)
      level = p.review.level
      targetId = p.review.assigneeId
      targetName = nameOf(p.review.assigneeId)
      if (!actorId && task?.assigneeId) {
        actorId = task.assigneeId
        actorName = nameOf(task.assigneeId)
      }
      break
    }
    case 'review.started': {
      const p = event.payload as OfficeEvent<'review.started'>['payload']
      category = 'review'
      const rev = state.reviews[p.reviewId]
      if (rev) {
        hydrateFromTask(state.tasks[rev.taskId])
        level = rev.level
        actorId = rev.assigneeId
        actorName = nameOf(rev.assigneeId)
      }
      break
    }
    case 'review.decided': {
      const p = event.payload as OfficeEvent<'review.decided'>['payload']
      category = 'review'
      const rev = state.reviews[p.reviewId]
      if (rev) {
        hydrateFromTask(state.tasks[rev.taskId])
        level = rev.level
        actorId = rev.assigneeId
        actorName = nameOf(rev.assigneeId)
      }
      decision = p.decision
      reason = p.note ?? null
      break
    }
    case 'review.escalated': {
      const p = event.payload as OfficeEvent<'review.escalated'>['payload']
      category = 'review'
      hydrateFromTask(state.tasks[p.newReview.taskId])
      level = p.toLevel
      targetId = p.newReview.assigneeId
      targetName = nameOf(p.newReview.assigneeId)
      break
    }
    case 'question.asked': {
      const p = event.payload as OfficeEvent<'question.asked'>['payload']
      category = 'help_question'
      hydrateFromTask(state.tasks[p.question.taskId])
      actorId = p.question.fromId
      actorName = nameOf(p.question.fromId)
      targetId = p.question.toId
      targetName = nameOf(p.question.toId)
      reason = p.question.text
      break
    }
    case 'question.answered': {
      const p = event.payload as OfficeEvent<'question.answered'>['payload']
      category = 'help_question'
      const q = state.questions[p.questionId]
      if (q) {
        hydrateFromTask(state.tasks[q.taskId])
        actorId = q.toId
        actorName = nameOf(q.toId)
        targetId = q.fromId
        targetName = nameOf(q.fromId)
      }
      reason = p.answer
      break
    }
    case 'help.requested': {
      const p = event.payload as OfficeEvent<'help.requested'>['payload']
      category = 'help_question'
      hydrateFromTask(state.tasks[p.help.taskId])
      actorId = p.help.fromId
      actorName = nameOf(p.help.fromId)
      targetId = p.help.toId
      targetName = p.help.toId ? nameOf(p.help.toId) : null
      specialtyKey = p.help.specialty
      break
    }
    case 'help.accepted':
    case 'help.answered': {
      const p = event.payload as OfficeEvent<'help.accepted'>['payload']
      category = 'help_question'
      const h = state.help[p.helpId]
      if (h) {
        hydrateFromTask(state.tasks[h.taskId])
        targetId = h.fromId
        targetName = nameOf(h.fromId)
        specialtyKey = h.specialty
      }
      actorId = p.byId
      actorName = nameOf(p.byId)
      break
    }
    case 'help.timed_out':
    case 'help.escalated': {
      const p = event.payload as OfficeEvent<'help.timed_out'>['payload']
      category = 'help_question'
      const h = state.help[p.helpId]
      if (h) {
        hydrateFromTask(state.tasks[h.taskId])
        actorId = h.fromId
        actorName = nameOf(h.fromId)
        specialtyKey = h.specialty
      }
      targetId = p.toId
      targetName = nameOf(p.toId)
      break
    }
    case 'person.activity': {
      const p = event.payload as OfficeEvent<'person.activity'>['payload']
      category = 'staff'
      actorId = p.employeeId
      actorName = nameOf(p.employeeId)
      activityKey = p.activity
      const emp = empMap.get(p.employeeId)
      departmentId = emp?.departmentId ?? null
      floorKey = p.locationHint?.floorKey ?? floorKeyOfEmp(p.employeeId)
      break
    }
    case 'staff.hired': {
      const p = event.payload as OfficeEvent<'staff.hired'>['payload']
      category = 'staff'
      actorId = p.employee.id
      actorName = p.employee.name
      departmentId = p.employee.departmentId
      floorKey = p.employee.departmentId
        ? (deptMap.get(p.employee.departmentId)?.key ?? null)
        : 'management'
      break
    }
    case 'staff.archived': {
      const p = event.payload as OfficeEvent<'staff.archived'>['payload']
      category = 'staff'
      actorId = p.employeeId
      actorName = nameOf(p.employeeId)
      reason = p.reason
      const emp = empMap.get(p.employeeId)
      departmentId = emp?.departmentId ?? null
      floorKey = floorKeyOfEmp(p.employeeId)
      break
    }
    case 'config.changed': {
      const p = event.payload as OfficeEvent<'config.changed'>['payload']
      category = 'system'
      reason = p.change.kind
      break
    }
    case 'system.heartbeat': {
      const p = event.payload as OfficeEvent<'system.heartbeat'>['payload']
      category = 'system'
      reason = `${p.source} v${p.version}`
      break
    }
    case 'sim.scenario': {
      const p = event.payload as OfficeEvent<'sim.scenario'>['payload']
      category = 'system'
      scenarioLabel = p.label
      reason = p.label.vi
      break
    }
  }

  if (!floorKey && actorId) {
    floorKey = floorKeyOfEmp(actorId)
  }

  const slots: Record<string, string | number> = {
    actor: actorName,
    target: targetName ?? 'đồng nghiệp',
    task: taskTitle ?? 'công việc',
    note: reason ?? '',
    reason: reason ?? '',
    level: level ?? '',
    progress: progressPercent ?? 0,
    specialty: specialtyKey,
    channel: channelKey,
    activity: activityKey,
    scenario: scenarioLabel?.vi ?? reason ?? '',
    decision: decision ?? '',
  }

  return {
    eventId: event.id,
    type: event.type,
    at: event.at,
    category,
    departmentId,
    floorKey,
    actorId,
    actorName,
    targetId,
    targetName,
    taskId,
    taskTitle,
    platformKey,
    shopName,
    decision,
    level,
    reason,
    progressPercent,
    scenarioLabel,
    slots,
  }
}

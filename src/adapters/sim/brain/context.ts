import type { Command, CommandAck } from '@/domain/commands'
import type { TaskType } from '@/domain/config'
import type {
  EventActor,
  EventPayloads,
  EventType,
  OfficeEvent,
} from '@/domain/events'
import type {
  DepartmentId,
  EmployeeId,
  HelpId,
  Priority,
  QuestionId,
  ReviewId,
  TaskId,
} from '@/domain/primitives'
import { apply } from '@/domain/reducer'
import { requiredLevel } from '@/domain/rules'
import type { OfficeState, Task } from '@/domain/work'
import type { SimClock } from '../clock'
import { renderTaskTitle, type TitleRenderContext } from '../content/vi'
import { intRange, pick, simId, type RandomFn } from '../rng'

export interface TaskRuntimeTimer {
  startedSimMs: number
  durationSimMs: number
  internalProgress: number
  lastProgressNotified: number
  handoffDone: boolean
  helpDone: boolean
  questionDone: boolean
  /** Failed attempts so far; each one resets progress until maxRetries is spent. */
  failures: number
  /** A task whose sync never works: it fails every attempt, then task.failed. */
  doomed: boolean
}

export interface ReviewRuntimeTimer {
  startedSimMs: number
  durationSimMs: number
}

export interface HelpRuntimeTimer {
  requestedSimMs: number
  acceptedSimMs: number | null
  durationSimMs: number
  /** Rolled once per round: a busy or slow helper never answers that round. */
  willAccept: boolean
}

export interface QuestionRuntimeTimer {
  askedSimMs: number
  answerDurationSimMs: number
  isBossTarget: boolean
  pendingIntakeText?: string
  pendingIntakeMessageId?: string
}

export interface GeneratorSlotState {
  nextFireSimMs: number
}

export interface SimBrainContext {
  state: OfficeState
  seq: number
  rng: RandomFn
  clock: SimClock
  teamOnline: boolean
  autoApproveBoss: boolean
  forceMonthEnd: boolean
  crowdedActive: boolean
  lastHeartbeatSimMs: number
  lastTickSimMs: number
  pendingEvents: OfficeEvent[]
  taskTimers: Map<TaskId, TaskRuntimeTimer>
  reviewTimers: Map<ReviewId, ReviewRuntimeTimer>
  helpTimers: Map<HelpId, HelpRuntimeTimer>
  questionTimers: Map<QuestionId, QuestionRuntimeTimer>
  deptOverloadSinceSimMs: Map<DepartmentId, number>
  generators: Record<
    'cs' | 'marketing' | 'design' | 'accounting' | 'bossIntake',
    GeneratorSlotState
  >
  /** Work generators for departments that have no task types of their own (P10-T13). */
  genericGenerators: Map<DepartmentId, GeneratorSlotState>
  /**
   * Set when the boss lowers `staffing.tempCap`: idle temps are then archived (longest idle
   * first) until the count fits. A boss-approved over-cap hire does not set it.
   */
  enforceTempCap: boolean
  queuedOfflineCommands: Command[]
  processedCommands: Map<string, CommandAck>
}

export function resolveEventActor(
  ctx: SimBrainContext,
  actor?: EventActor | EmployeeId | 'system' | 'customer',
): EventActor {
  if (!actor || actor === 'system') {
    return { kind: 'system', id: null }
  }
  if (actor === 'customer') {
    return { kind: 'customer', id: null }
  }
  if (typeof actor === 'object') {
    return actor
  }
  const emp = ctx.state.config.employees.find((e) => e.id === actor)
  if (emp && isOwnerRole(ctx, emp.roleKey)) {
    return { kind: 'owner', id: actor }
  }
  return { kind: 'employee', id: actor }
}

export function emitSimEvent<T extends EventType>(
  ctx: SimBrainContext,
  type: T,
  payload: EventPayloads[T],
  opts?: {
    actor?: EventActor | EmployeeId | 'system' | 'customer'
    causedBy?: string | null
  },
): OfficeEvent<T> {
  ctx.seq += 1
  const nowMs = ctx.clock.nowMs()
  const ev = {
    v: 1 as const,
    id: simId('evt', ctx.rng, nowMs),
    seq: ctx.seq,
    at: ctx.clock.now(),
    type,
    actor: resolveEventActor(ctx, opts?.actor),
    causedBy: opts?.causedBy ?? null,
    payload,
  } as OfficeEvent<T>
  ctx.state = apply(ctx.state, ev as OfficeEvent)
  ctx.pendingEvents.push(ev as OfficeEvent)
  return ev
}

export function departmentIdForTaskType(
  ctx: SimBrainContext,
  taskType: TaskType,
): DepartmentId {
  const dept = ctx.state.config.departments.find(
    (d) => d.key === taskType.departmentKey || d.id === taskType.departmentKey,
  )
  return dept?.id ?? (`dep_${taskType.departmentKey}` as DepartmentId)
}

/** What a role may do, from config; the sim reasons about caps, not role keys. */
export function roleCaps(ctx: SimBrainContext, roleKey: string) {
  return ctx.state.config.roles.find((r) => r.key === roleKey)?.caps
}

export function isOwnerRole(ctx: SimBrainContext, roleKey: string): boolean {
  return roleCaps(ctx, roleKey)?.humanOwner === true
}

function firstActiveEmployeeId(ctx: SimBrainContext): EmployeeId {
  const emp = ctx.state.config.employees.find((e) => e.state === 'active')
  if (!emp) throw new Error('No active employee in config')
  return emp.id
}

export function getPrimaryOwnerEmployeeId(ctx: SimBrainContext): EmployeeId {
  const owner = ctx.state.config.employees.find(
    (e) => e.state === 'active' && isOwnerRole(ctx, e.roleKey),
  )
  return owner?.id ?? firstActiveEmployeeId(ctx)
}

/** The office manager: assigns work across departments, no approval seat, no desk work. */
export function getManagerEmployeeId(ctx: SimBrainContext): EmployeeId {
  const mgr = ctx.state.config.employees.find((e) => {
    const caps = e.state === 'active' ? roleCaps(ctx, e.roleKey) : undefined
    return (
      caps?.assignTasks === true &&
      caps.approveLevel === null &&
      !caps.humanOwner &&
      !caps.doWork
    )
  })
  return mgr?.id ?? getPrimaryOwnerEmployeeId(ctx)
}

export function getDeptManagerEmployeeId(
  ctx: SimBrainContext,
  departmentId: DepartmentId,
): EmployeeId {
  const mgr = ctx.state.config.employees.find(
    (e) =>
      e.state === 'active' &&
      e.departmentId === departmentId &&
      roleCaps(ctx, e.roleKey)?.approveLevel === 'dept_manager',
  )
  return mgr?.id ?? getManagerEmployeeId(ctx)
}

/** Keys of the platforms the boss has left switched on (R9). */
export function activePlatformKeys(ctx: SimBrainContext): Set<string> {
  return new Set(
    ctx.state.config.platforms.filter((p) => p.active).map((p) => p.key),
  )
}

/**
 * An employee id no one in the config has: ids come from a seeded RNG, so after a reload the
 * sim could draw an id that a persisted employee already owns (P10-T13).
 */
export function newEmployeeId(ctx: SimBrainContext): EmployeeId {
  const taken = new Set(ctx.state.config.employees.map((e) => e.id))
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const id = simId('emp', ctx.rng, ctx.clock.nowMs() + attempt)
    if (!taken.has(id)) return id
  }
  throw new Error('Could not generate a unique employee id')
}

/** A department id looked up by its config key (e.g. 'cs'), not hard-coded. */
export function departmentIdByKey(
  ctx: SimBrainContext,
  key: string,
): DepartmentId {
  const dept =
    ctx.state.config.departments.find((d) => d.key === key && d.active) ??
    ctx.state.config.departments.find((d) => d.active)
  if (!dept) throw new Error('No active department in config')
  return dept.id
}

/**
 * Active people in a department who do the work, in stable id order.
 * Chosen by capability (doWork), not by role key.
 */
export function departmentWorkers(
  ctx: SimBrainContext,
  departmentId: DepartmentId,
): EmployeeId[] {
  const roles = new Map(ctx.state.config.roles.map((r) => [r.key, r]))
  return ctx.state.config.employees
    .filter(
      (e) =>
        e.state === 'active' &&
        e.departmentId === departmentId &&
        roles.get(e.roleKey)?.caps.doWork === true &&
        Boolean(ctx.state.people[e.id]),
    )
    .map((e) => e.id)
    .sort()
}

export interface CreateSimTaskOptions {
  requestedByKind?: Task['requestedBy']['kind']
  requestedById?: string | null
  channel?: Task['channel']
  priority?: Priority
  departmentId?: DepartmentId
  platformKey?: string | null
  shopId?: string | null
  parentTaskId?: TaskId | null
  title?: string
  detail?: string | null
  titleCtx?: TitleRenderContext
  extraTags?: readonly string[]
  /** A task type that is not in the config (the generic set for departments without one). */
  taskType?: TaskType
  amountVnd?: number | null
  crossDepartment?: boolean
  actor?: EventActor | EmployeeId | 'system' | 'customer'
  causedBy?: string | null
}

function liveTitlePlatform(
  ctx: SimBrainContext,
  activeKeys: ReadonlySet<string>,
): { platform: string; shop: string } | undefined {
  const { platforms, shops } = ctx.state.config
  const liveShops = shops.filter((s) => activeKeys.has(s.platformKey))
  if (liveShops.length > 0) {
    const shop = pick(ctx.rng, liveShops)
    const platform = platforms.find((p) => p.key === shop.platformKey)
    return { platform: platform?.label.vi ?? shop.platformKey, shop: shop.name }
  }
  const live = platforms.filter((p) => activeKeys.has(p.key))
  if (live.length === 0) return undefined
  const platform = pick(ctx.rng, live)
  return { platform: platform.label.vi, shop: platform.label.vi }
}

export function createTaskInBrain(
  ctx: SimBrainContext,
  typeKey: string,
  opts: CreateSimTaskOptions = {},
): Task {
  const tt =
    opts.taskType ??
    ctx.state.config.taskTypes.find((t) => t.key === typeKey) ??
    ctx.state.config.taskTypes[0]!
  const departmentId =
    opts.departmentId ?? departmentIdForTaskType(ctx, tt)
  const requestedPlatformKey =
    opts.platformKey !== undefined
      ? opts.platformKey
      : tt.platformKeys.length > 0
        ? pick(ctx.rng, tt.platformKeys)
        : null
  // R9: a platform switched off never lands on a new task. Another active platform of the
  // same task type stands in; with none, the task carries no platform.
  const hasInactivePlatform = ctx.state.config.platforms.some((p) => !p.active)
  const activeKeys = hasInactivePlatform ? activePlatformKeys(ctx) : null
  const platformKey =
    activeKeys === null ||
    requestedPlatformKey === null ||
    activeKeys.has(requestedPlatformKey)
      ? requestedPlatformKey
      : (tt.platformKeys.find((k) => activeKeys.has(k)) ?? null)

  const matchingShops = platformKey
    ? ctx.state.config.shops.filter((s) => s.platformKey === platformKey)
    : []
  const shopObj =
    matchingShops.length > 0 ? pick(ctx.rng, matchingShops) : null
  const shopId = opts.shopId !== undefined ? opts.shopId : (shopObj?.id ?? null)

  const tags = Array.from(new Set([...tt.tags, ...(opts.extraTags ?? [])]))
  const priority = opts.priority ?? tt.defaultPriority
  const crossDepartment =
    opts.crossDepartment ??
    (tags.includes('cross_department') || Boolean(opts.parentTaskId))

  const amountVnd =
    opts.amountVnd !== undefined
      ? opts.amountVnd
      : tags.includes('refund') || typeKey === 'acc.supplier_payment'
        ? intRange(ctx.rng, 800_000, 3_200_000)
        : tags.includes('money')
          ? intRange(ctx.rng, 250_000, 2_400_000)
          : null

  const ruleResult = requiredLevel(
    {
      typeKey: tt.key,
      departmentId,
      tags,
      platformKey,
      amountVnd,
    },
    ctx.state.config.approvalRules,
    ctx.state.config.policy,
    {
      crossDepartment,
    },
  )

  const { month } = ctx.clock.getIctParts()
  // The title pools name every platform and shop; with one switched off, keep them to live ones.
  const titlePlatform =
    activeKeys !== null && platformKey === null
      ? liveTitlePlatform(ctx, activeKeys)
      : undefined
  const title =
    opts.title ??
    renderTaskTitle(tt.key, ctx.rng, {
      departmentId,
      platformKey: platformKey ?? undefined,
      shop: shopObj?.name ?? titlePlatform?.shop,
      platform: titlePlatform?.platform,
      month,
      quarter: Math.ceil(month / 3),
      ...opts.titleCtx,
    })

  const requestedByKind = opts.requestedByKind ?? 'customer'
  const requestedById =
    opts.requestedById !== undefined
      ? opts.requestedById
      : requestedByKind === 'boss'
        ? getPrimaryOwnerEmployeeId(ctx)
        : requestedByKind === 'manager'
          ? getManagerEmployeeId(ctx)
          : null

  const channel: Task['channel'] =
    opts.channel ??
    (requestedByKind === 'boss'
      ? 'telegram'
      : requestedByKind === 'schedule'
        ? 'schedule'
        : requestedByKind === 'customer'
          ? 'platform'
          : 'internal')

  const task: Task = {
    id: simId('task', ctx.rng, ctx.clock.nowMs()),
    typeKey: tt.key,
    title,
    detail: opts.detail ?? null,
    departmentId,
    assigneeId: null,
    requestedBy: {
      kind: requestedByKind,
      id: requestedById,
    },
    channel,
    platformKey,
    shopId,
    amountVnd,
    tags,
    priority,
    createdAt: ctx.clock.now(),
    startedAt: null,
    finishedAt: null,
    status: 'queued',
    progress: 0,
    requiredLevel: ruleResult.level,
    matchedRuleIds: ruleResult.matchedRuleIds,
    parentTaskId: opts.parentTaskId ?? null,
    attempts: 0,
  }

  emitSimEvent(
    ctx,
    'task.created',
    { task },
    {
      actor: opts.actor ?? (requestedById ? (requestedById as EmployeeId) : requestedByKind === 'customer' ? 'customer' : 'system'),
      causedBy: opts.causedBy,
    },
  )

  return task
}

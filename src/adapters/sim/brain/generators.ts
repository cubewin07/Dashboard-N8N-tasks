import type { DepartmentId } from '@/domain/primitives'
import {
  BOSS_MESSAGES_VI,
  GENERIC_TASK_TEMPLATES_VI,
  genericTaskType,
} from '../content/vi'
import { chance, intRange, pick, simId } from '../rng'
import {
  createTaskInBrain,
  emitSimEvent,
  getManagerEmployeeId,
  getPrimaryOwnerEmployeeId,
  roleCaps,
  type SimBrainContext,
} from './context'
import { SIM_ODDS } from './odds'

const MS_PER_HOUR = 3_600_000

function nextIntervalFromHourlyRange(
  ctx: SimBrainContext,
  rangePerHour: readonly [number, number],
  multiplier = 1,
): number {
  const rate =
    intRange(ctx.rng, rangePerHour[0], rangePerHour[1]) *
    Math.max(1, multiplier)
  const baseIntervalMs = Math.floor(MS_PER_HOUR / Math.max(1, rate))
  const minMs = Math.max(30_000, Math.floor(baseIntervalMs * 0.85))
  const maxMs = Math.max(minMs + 1_000, Math.floor(baseIntervalMs * 1.15))
  return intRange(ctx.rng, minMs, maxMs)
}

function isDepartmentActive(ctx: SimBrainContext, key: string): boolean {
  return ctx.state.config.departments.some((d) => d.key === key && d.active)
}

/**
 * Departments with no task types of their own (a floor the boss added) and at least one
 * person to do the work: they get the generic routine set so the floor is alive at once.
 */
export function genericDepartments(ctx: SimBrainContext) {
  const { departments, taskTypes, employees } = ctx.state.config
  const withTypes = new Set(
    taskTypes.filter((t) => !t.key.startsWith('sys.')).map((t) => t.departmentKey),
  )
  return departments
    .filter((d) => d.active && !withTypes.has(d.key))
    .filter((d) =>
      employees.some(
        (e) =>
          e.state === 'active' &&
          e.departmentId === d.id &&
          roleCaps(ctx, e.roleKey)?.doWork === true &&
          Boolean(ctx.state.people[e.id]),
      ),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function runGenericGenerators(ctx: SimBrainContext, isLunch: boolean): void {
  const nowMs = ctx.clock.nowMs()
  const policy = ctx.state.config.policy
  const eligible = genericDepartments(ctx)
  const eligibleIds = new Set<DepartmentId>(eligible.map((d) => d.id))
  for (const id of ctx.genericGenerators.keys()) {
    if (!eligibleIds.has(id)) ctx.genericGenerators.delete(id)
  }

  for (const dept of eligible) {
    let slot = ctx.genericGenerators.get(dept.id)
    if (!slot) {
      slot = { nextFireSimMs: nowMs + intRange(ctx.rng, 60_000, 180_000) }
      ctx.genericGenerators.set(dept.id, slot)
    }
    const open =
      dept.hours === '24_7' || (ctx.clock.isWorkHours(dept, policy) && !isLunch)
    if (!open) {
      if (slot.nextFireSimMs <= nowMs) {
        slot.nextFireSimMs = nowMs + intRange(ctx.rng, 120_000, 300_000)
      }
      continue
    }
    while (nowMs >= slot.nextFireSimMs) {
      const template = pick(ctx.rng, GENERIC_TASK_TEMPLATES_VI)
      createTaskInBrain(ctx, template.key, {
        taskType: genericTaskType(template, dept.key),
        departmentId: dept.id,
        requestedByKind: 'schedule',
        channel: 'schedule',
        titleCtx: { department: dept.label.vi },
      })
      slot.nextFireSimMs += nextIntervalFromHourlyRange(
        ctx,
        SIM_ODDS.hourlyTaskRates.generic,
        ctx.crowdedActive ? 2 : 1,
      )
    }
  }
}

export function initGeneratorSchedule(ctx: SimBrainContext): void {
  const nowMs = ctx.clock.nowMs()
  ctx.generators.cs.nextFireSimMs = nowMs + intRange(ctx.rng, 60_000, 180_000)
  ctx.generators.marketing.nextFireSimMs =
    nowMs + intRange(ctx.rng, 120_000, 300_000)
  ctx.generators.design.nextFireSimMs =
    nowMs + intRange(ctx.rng, 180_000, 360_000)
  ctx.generators.accounting.nextFireSimMs =
    nowMs + intRange(ctx.rng, 240_000, 480_000)
  ctx.generators.bossIntake.nextFireSimMs =
    nowMs + intRange(ctx.rng, 300_000, 600_000)
}

export function runGenerators(ctx: SimBrainContext): void {
  const nowMs = ctx.clock.nowMs()
  const policy = ctx.state.config.policy
  const isLunch = ctx.clock.isLunch(policy)

  const officeDeptSample = ctx.state.config.departments.find(
    (d) => d.hours === 'office',
  )
  const isOfficeOpen =
    ctx.clock.isWorkHours(officeDeptSample ?? { hours: 'office' }, policy) &&
    !isLunch

  // 1. CS generator (24/7)
  while (nowMs >= ctx.generators.cs.nextFireSimMs) {
    const csTypes = ctx.state.config.taskTypes.filter(
      (t) => t.departmentKey === 'cs' && !t.key.startsWith('sys.'),
    )
    if (csTypes.length > 0 && isDepartmentActive(ctx, 'cs')) {
      const chosen = pick(ctx.rng, csTypes)
      createTaskInBrain(ctx, chosen.key, {
        requestedByKind: 'customer',
        channel: 'platform',
      })
    }
    const rateRange = isOfficeOpen
      ? SIM_ODDS.hourlyTaskRates.csDay
      : SIM_ODDS.hourlyTaskRates.csNight
    ctx.generators.cs.nextFireSimMs += nextIntervalFromHourlyRange(
      ctx,
      rateRange,
      ctx.crowdedActive ? 2 : 1,
    )
  }

  // 1b. Departments without task types of their own (P10-T13)
  runGenericGenerators(ctx, isLunch)

  // Office-hours generators: if outside office hours or at lunch, advance nextFireSimMs
  if (!isOfficeOpen) {
    for (const key of [
      'marketing',
      'design',
      'accounting',
      'bossIntake',
    ] as const) {
      if (ctx.generators[key].nextFireSimMs <= nowMs) {
        ctx.generators[key].nextFireSimMs =
          nowMs + intRange(ctx.rng, 120_000, 300_000)
      }
    }
    return
  }

  // 2. Marketing generator
  while (nowMs >= ctx.generators.marketing.nextFireSimMs) {
    const mktTypes = ctx.state.config.taskTypes.filter(
      (t) => t.departmentKey === 'marketing' && !t.key.startsWith('sys.'),
    )
    if (mktTypes.length > 0 && isDepartmentActive(ctx, 'marketing')) {
      const chosen = pick(ctx.rng, mktTypes)
      const isSchedule = chance(ctx.rng, 0.5)
      createTaskInBrain(ctx, chosen.key, {
        requestedByKind: isSchedule ? 'schedule' : 'manager',
        channel: isSchedule ? 'schedule' : 'internal',
      })
    }
    ctx.generators.marketing.nextFireSimMs += nextIntervalFromHourlyRange(
      ctx,
      SIM_ODDS.hourlyTaskRates.marketing,
      ctx.crowdedActive ? 2 : 1,
    )
  }

  // 3. Design generator
  while (nowMs >= ctx.generators.design.nextFireSimMs) {
    const designTypes = ctx.state.config.taskTypes.filter(
      (t) => t.departmentKey === 'design',
    )
    if (designTypes.length > 0 && isDepartmentActive(ctx, 'design')) {
      const chosen = pick(ctx.rng, designTypes)
      createTaskInBrain(ctx, chosen.key, {
        requestedByKind: 'schedule',
        channel: 'schedule',
      })
    }
    ctx.generators.design.nextFireSimMs += nextIntervalFromHourlyRange(
      ctx,
      SIM_ODDS.hourlyTaskRates.design,
      ctx.crowdedActive ? 2 : 1,
    )
  }

  // 4. Accounting generator (x3 at month-end / quarter-end)
  const isMonthEnd =
    ctx.forceMonthEnd || ctx.clock.isMonthEnd() || ctx.clock.isQuarterEnd()
  while (nowMs >= ctx.generators.accounting.nextFireSimMs) {
    const atQuarterEnd = ctx.forceMonthEnd || ctx.clock.isQuarterEnd()
    const accTypes = ctx.state.config.taskTypes.filter(
      (t) =>
        t.departmentKey === 'accounting' &&
        (atQuarterEnd || !SIM_ODDS.quarterlyTypeKeys.includes(t.key)),
    )
    if (accTypes.length > 0 && isDepartmentActive(ctx, 'accounting')) {
      const chosen = pick(ctx.rng, accTypes)
      createTaskInBrain(ctx, chosen.key, {
        requestedByKind: 'schedule',
        channel: 'schedule',
      })
    }
    const mult =
      (isMonthEnd ? SIM_ODDS.hourlyTaskRates.accountingMonthEndMultiplier : 1) *
      (ctx.crowdedActive ? 2 : 1)
    ctx.generators.accounting.nextFireSimMs += nextIntervalFromHourlyRange(
      ctx,
      SIM_ODDS.hourlyTaskRates.accounting,
      mult,
    )
  }

  // 5. Boss intake generator
  while (nowMs >= ctx.generators.bossIntake.nextFireSimMs) {
    const msg = pick(ctx.rng, BOSS_MESSAGES_VI)
    // A message about a department the boss switched off would only pile up unassigned.
    if (
      ctx.state.config.departments.some(
        (d) => d.id === msg.departmentId && d.active,
      )
    ) {
      const managerId = getManagerEmployeeId(ctx)
      const ownerId = getPrimaryOwnerEmployeeId(ctx)
      const messageId = simId('msg', ctx.rng, nowMs)
      emitSimEvent(
        ctx,
        'intake.received',
        {
          messageId,
          channel: chance(ctx.rng, 0.7) ? 'telegram' : 'app',
          modality: chance(ctx.rng, 0.35) ? 'voice' : 'text',
          fromUserId: ownerId,
          text: msg.text,
        },
        { actor: ownerId },
      )
      createTaskInBrain(ctx, msg.typeKey, {
        requestedByKind: 'boss',
        requestedById: ownerId,
        channel: 'telegram',
        priority: msg.priority,
        departmentId: msg.departmentId,
        platformKey: msg.platformKey,
        actor: managerId,
        causedBy: messageId,
      })
    }
    ctx.generators.bossIntake.nextFireSimMs += nextIntervalFromHourlyRange(
      ctx,
      SIM_ODDS.hourlyTaskRates.bossIntake,
    )
  }
}

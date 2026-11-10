import { BOSS_MESSAGES_VI } from '../content/vi'
import { chance, intRange, pick, simId } from '../rng'
import {
  createTaskInBrain,
  emitSimEvent,
  getManagerEmployeeId,
  getPrimaryOwnerEmployeeId,
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
    if (csTypes.length > 0) {
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
    if (mktTypes.length > 0) {
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
    if (designTypes.length > 0) {
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
    const accTypes = ctx.state.config.taskTypes.filter(
      (t) => t.departmentKey === 'accounting',
    )
    if (accTypes.length > 0) {
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
    const managerId = getManagerEmployeeId(ctx)
    const ownerId = getPrimaryOwnerEmployeeId(ctx)
    emitSimEvent(
      ctx,
      'intake.received',
      {
        messageId: simId('msg', ctx.rng, nowMs),
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
    })
    ctx.generators.bossIntake.nextFireSimMs += nextIntervalFromHourlyRange(
      ctx,
      SIM_ODDS.hourlyTaskRates.bossIntake,
    )
  }
}

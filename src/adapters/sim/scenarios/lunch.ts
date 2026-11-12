import {
  emitSimEvent,
  type SimBrainContext,
} from '../brain/context'

/**
 * "Giờ nghỉ trưa" (P05-T15): skip the sim clock to two minutes before lunch
 * (`policy.calendar.lunch[0]`), so the nap starts on screen shortly after.
 *
 * The skip pauses the simulation instead of fast-forwarding it: every running
 * timer and generator moves forward by the same amount, so nothing fires in a
 * burst. If today's lunch has already started, it skips to the next working
 * day (Sunday is off for office departments).
 */

const LEAD_MINUTES = 2
const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE

function parseHhMm(hhmm: string): number {
  const [h = '0', m = '0'] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

export function lunchSkipTargetMs(ctx: SimBrainContext): number {
  const nowMs = ctx.clock.nowMs()
  const { minutesOfDay, dayOfWeek } = ctx.clock.getIctParts()
  const lunchStart = parseHhMm(ctx.state.config.policy.calendar.lunch[0])
  const targetMinute = lunchStart - LEAD_MINUTES
  // Sim time sits on whole seconds; keep the seconds of "now" out of the target.
  const startOfMinuteMs = nowMs - (nowMs % MS_PER_MINUTE)
  let target = startOfMinuteMs + (targetMinute - minutesOfDay) * MS_PER_MINUTE
  let weekday = dayOfWeek
  if (target <= nowMs) {
    target += MS_PER_DAY
    weekday = (weekday + 1) % 7
  }
  if (weekday === 0) target += MS_PER_DAY
  return target
}

function shiftTimers(ctx: SimBrainContext, deltaMs: number): void {
  for (const t of ctx.taskTimers.values()) t.startedSimMs += deltaMs
  for (const t of ctx.reviewTimers.values()) t.startedSimMs += deltaMs
  for (const t of ctx.questionTimers.values()) t.askedSimMs += deltaMs
  for (const t of ctx.helpTimers.values()) {
    t.requestedSimMs += deltaMs
    if (t.acceptedSimMs !== null) t.acceptedSimMs += deltaMs
  }
  for (const g of Object.values(ctx.generators)) g.nextFireSimMs += deltaMs
  for (const [dept, since] of ctx.deptOverloadSinceSimMs) {
    ctx.deptOverloadSinceSimMs.set(dept, since + deltaMs)
  }
  ctx.lastHeartbeatSimMs += deltaMs
  ctx.lastTickSimMs += deltaMs
}

export function runLunchScenario(ctx: SimBrainContext): void {
  const target = lunchSkipTargetMs(ctx)
  const delta = target - ctx.clock.nowMs()
  if (delta > 0) {
    ctx.clock.setNow(target)
    shiftTimers(ctx, delta)
  }
  emitSimEvent(ctx, 'sim.scenario', {
    key: 'lunch',
    label: { vi: 'Giờ nghỉ trưa', en: 'Lunch break' },
  })
}

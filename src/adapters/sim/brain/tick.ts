import type { OfficeEvent } from '@/domain/events'
import { initialState } from '@/domain/reducer'
import type { OrgConfig } from '@/domain/config'
import { SimClock, type SimSpeed } from '../clock'
import { mulberry32 } from '../rng'
import {
  stepAssignments,
  stepHelps,
  stepPersonShifts,
  stepQuestions,
  stepReviews,
  stepStaffing,
  stepWorkers,
} from './agents'
import { flushOfflineCommands } from './commands'
import { emitSimEvent, type SimBrainContext } from './context'
import { initGeneratorSchedule, runGenerators } from './generators'

// 7,500 sim-ms = 250 ms real * 30x speed
export const SIM_QUANTUM_MS = 7_500
export const REAL_TICK_MS = 250
export const HEARTBEAT_INTERVAL_SIM_MS = 60_000

export function createBrainContext(
  config: OrgConfig,
  seed: string | number,
  initialSpeed: SimSpeed = 30,
): SimBrainContext {
  const clock = new SimClock(undefined, initialSpeed)
  const rng = mulberry32(seed)
  const startIso = clock.now()
  const startMs = clock.nowMs()

  const ctx: SimBrainContext = {
    state: initialState(config, startIso),
    seq: 0,
    rng,
    clock,
    teamOnline: true,
    autoApproveBoss: false,
    forceMonthEnd: false,
    crowdedActive: false,
    lastHeartbeatSimMs: startMs - HEARTBEAT_INTERVAL_SIM_MS,
    lastTickSimMs: startMs,
    pendingEvents: [],
    taskTimers: new Map(),
    reviewTimers: new Map(),
    helpTimers: new Map(),
    questionTimers: new Map(),
    deptOverloadSinceSimMs: new Map(),
    generators: {
      cs: { nextFireSimMs: startMs },
      marketing: { nextFireSimMs: startMs },
      design: { nextFireSimMs: startMs },
      accounting: { nextFireSimMs: startMs },
      bossIntake: { nextFireSimMs: startMs },
    },
    queuedOfflineCommands: [],
    processedCommands: new Map(),
  }

  initGeneratorSchedule(ctx)

  return ctx
}

export function stepBrainQuantum(ctx: SimBrainContext): void {
  ctx.clock.advanceSimMs(SIM_QUANTUM_MS)
  const nowMs = ctx.clock.nowMs()
  ctx.lastTickSimMs = nowMs

  if (ctx.teamOnline) {
    if (nowMs - ctx.lastHeartbeatSimMs >= HEARTBEAT_INTERVAL_SIM_MS) {
      ctx.lastHeartbeatSimMs = nowMs
      emitSimEvent(ctx, 'system.heartbeat', {
        source: 'sim',
        version: '1.0.0',
      })
    }
    flushOfflineCommands(ctx)
  }

  stepPersonShifts(ctx)
  runGenerators(ctx)
  stepAssignments(ctx)
  stepWorkers(ctx, SIM_QUANTUM_MS)
  stepHelps(ctx)
  stepQuestions(ctx)
  stepReviews(ctx)
  stepStaffing(ctx)
}

export function flushBrainPendingEvents(
  ctx: SimBrainContext,
): OfficeEvent[] {
  if (ctx.pendingEvents.length === 0) return []
  return ctx.pendingEvents.splice(0, ctx.pendingEvents.length)
}

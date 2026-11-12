import goldenRaw from '@/domain/__fixtures__/golden/day-seed-1.json'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { OfficeEvent } from '@/domain/events'
import { applyAll, initialState } from '@/domain/reducer'
import type { OfficeState } from '@/domain/work'
import { buildBuildingLayout, type BuildingLayout } from '@/scene/layout'
import { Director } from '../director'
import { moveFactor, TUNING } from '../tuning'

export interface GoldenBundle {
  seed: string
  startIso: string
  simDurationMs: number
  events: OfficeEvent[]
}

export const golden = goldenRaw as unknown as GoldenBundle

export interface RunOptions {
  /** Feed clock rate (1, 30, 120). */
  speed?: number
  seed?: string
  events?: OfficeEvent[]
  startIso?: string
  durationMs?: number
  onTick?: (director: Director, state: OfficeState, tick: number) => void
}

export interface RunResult {
  director: Director
  layout: BuildingLayout
  state: OfficeState
  warnings: string[]
  ticks: number
}

/**
 * Replays an event log through the reducer and the director at a fixed
 * 10 Hz, the way the canvas does at `speed`×: each tick is 0.1 visual
 * seconds, and the feed clock advances by the matching amount of sim time.
 */
export function runDirector(options: RunOptions = {}): RunResult {
  const speed = options.speed ?? 30
  const events = options.events ?? golden.events
  const startIso = options.startIso ?? golden.startIso
  const durationMs = options.durationMs ?? golden.simDurationMs
  const config = makeSeedConfig()
  const layout = buildBuildingLayout(config)
  const warnings: string[] = []
  const director = new Director(layout, config.building.elevator, {
    seed: options.seed ?? 'test',
    warn: (m) => warnings.push(m),
  })

  let state = initialState(config, startIso)
  director.sync(state)

  const startMs = Date.parse(startIso)
  const simMsPerTick = (TUNING.tickSeconds / moveFactor(speed)) * speed * 1000
  const totalTicks = Math.ceil(durationMs / simMsPerTick)
  let cursor = 0
  for (let tick = 0; tick < totalTicks; tick += 1) {
    const nowMs = startMs + (tick + 1) * simMsPerTick
    const batch: OfficeEvent[] = []
    while (cursor < events.length && Date.parse(events[cursor]!.at) <= nowMs) {
      batch.push(events[cursor]!)
      cursor += 1
    }
    if (batch.length > 0) {
      state = applyAll(state, batch)
      director.sync(state)
    }
    director.tick(TUNING.tickSeconds)
    options.onTick?.(director, state, tick)
  }
  return { director, layout, state, warnings, ticks: totalTicks }
}

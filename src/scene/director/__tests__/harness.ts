import goldenRaw from '@/domain/__fixtures__/golden/day-seed-1.json'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { OfficeEvent } from '@/domain/events'
import type { EventId, Iso } from '@/domain/primitives'
import { apply, applyAll, initialState } from '@/domain/reducer'
import type { OfficeState } from '@/domain/work'
import { buildBuildingLayout, type BuildingLayout } from '@/scene/layout'
import { Director, type DirectorOptions } from '../director'
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
  director?: Omit<DirectorOptions, 'seed' | 'warn'>
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
    ...options.director,
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

export interface WorldOptions {
  director?: Omit<DirectorOptions, 'seed' | 'warn'>
  /** Sim start (default: the golden day's start). */
  startIso?: string
}

/** A small hand-driven world for the scenario tests. */
export function makeWorld(seed = 'scenario', options: WorldOptions = {}) {
  const config = makeSeedConfig()
  const layout = buildBuildingLayout(config)
  const warnings: string[] = []
  const director = new Director(layout, config.building.elevator, {
    ...options.director,
    seed,
    warn: (m) => warnings.push(m),
  })
  const startIso = options.startIso ?? golden.startIso
  let state: OfficeState = initialState(config, startIso)
  director.sync(state)
  let seq = 0
  let nowMs = Date.parse(startIso)

  const world = {
    director,
    layout,
    warnings,
    get state() {
      return state
    },
    /** Apply one event at the current sim time. */
    emit(build: (seq: number, at: Iso, id: EventId) => OfficeEvent) {
      seq += 1
      const at = new Date(nowMs).toISOString()
      const id = `evt_01JTEST${String(seq).padStart(19, '0')}` as EventId
      state = apply(state, build(seq, at, id))
      director.sync(state)
    },
    get nowMs() {
      return nowMs
    },
    /** Tick until `until` is true; returns the number of ticks, or -1 on timeout. */
    run(maxSeconds: number, until?: () => boolean): number {
      const ticks = Math.ceil(maxSeconds / TUNING.tickSeconds)
      for (let i = 0; i < ticks; i += 1) {
        // Sim time moves at 30× behind the ticks; it only matters for dwell and staleness.
        nowMs += TUNING.tickSeconds * 30_000
        director.tick(TUNING.tickSeconds)
        if (until?.()) return i + 1
      }
      return until ? -1 : ticks
    },
    debug(id: string) {
      return director.debugPeople().find((p) => p.id === id)
    },
  }
  return world
}


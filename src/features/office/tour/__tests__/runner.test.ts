import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventType } from '@/domain/events'
import type { TourControlsApi } from '@/office/extensions'
import defaultTourJson from '../defaultTour.json'
import { TourRunner, type TourPorts } from '../runner'
import { TourSchema, type Tour } from '../tourSchema'

const defaultTour = TourSchema.parse(defaultTourJson)

function harness(tour: Tour, withSim = true) {
  const calls: string[] = []
  const handlers = new Map<EventType, Set<() => void>>()
  const sim: TourControlsApi = {
    begin: (seed) => calls.push(`sim.begin ${seed}`),
    apply: (s) => calls.push(`sim.apply ${JSON.stringify(s)}`),
    end: () => calls.push('sim.end'),
  }
  const ports: TourPorts<string> = {
    camera: {
      capture: () => 'saved-view',
      restore: (v) => calls.push(`camera.restore ${v}`),
      show: (c) => calls.push(`camera.show ${JSON.stringify(c)}`),
    },
    sim: withSim ? sim : null,
    onEvent: (type, cb) => {
      const set = handlers.get(type) ?? new Set()
      set.add(cb)
      handlers.set(type, set)
      return () => set.delete(cb)
    },
  }
  const fire = (type: EventType) => handlers.get(type)?.forEach((cb) => cb())
  const listening = () => [...handlers.values()].reduce((n, s) => n + s.size, 0)
  return { runner: new TourRunner(tour, ports), calls, fire, listening }
}

const small: Tour = {
  key: 't',
  seed: 's1',
  steps: [
    { id: 'a', caption: { vi: 'A', en: 'A' }, durationSec: 10, camera: { mode: 'overview' } },
    {
      id: 'b',
      caption: { vi: 'B', en: 'B' },
      durationSec: 30,
      camera: { mode: 'floor', floorKey: 'cs' },
      sim: { scenario: 'lunch' },
      waitFor: 'review.requested',
      minSec: 5,
    },
    { id: 'c', caption: { vi: 'C', en: 'C' }, durationSec: 10, camera: { mode: 'floor', floorKey: 'boss' } },
  ],
}

describe('TourRunner', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs the default tour unattended to the end, twice the same way, and restores', () => {
    const totalMs = defaultTour.steps.reduce((ms, s) => ms + s.durationSec * 1000, 0)
    const runs: string[][] = []
    for (let i = 0; i < 2; i += 1) {
      const { runner, calls, listening } = harness(defaultTour)
      runner.start()
      expect(runner.view().status).toBe('running')
      vi.advanceTimersByTime(totalMs - 1)
      expect(runner.view().index).toBe(defaultTour.steps.length - 1)
      vi.advanceTimersByTime(1)
      expect(runner.view()).toMatchObject({ status: 'idle', index: -1 })
      expect(calls[0]).toBe(`sim.begin ${defaultTour.seed}`)
      expect(calls.slice(-2)).toEqual(['sim.end', 'camera.restore saved-view'])
      expect(listening()).toBe(0)
      runs.push(calls)
    }
    expect(runs[0]).toEqual(runs[1])
  })

  it('leaves a waitFor step when its event arrives, but not before minSec', () => {
    const { runner, fire } = harness(small)
    runner.start()
    vi.advanceTimersByTime(10_000)
    expect(runner.view().index).toBe(1)
    vi.advanceTimersByTime(2_000)
    fire('review.requested')
    vi.advanceTimersByTime(2_999)
    expect(runner.view().index).toBe(1)
    vi.advanceTimersByTime(1)
    expect(runner.view().index).toBe(2)
  })

  it('times out a waitFor step whose event never comes', () => {
    const { runner } = harness(small)
    runner.start()
    vi.advanceTimersByTime(10_000 + 30_000)
    expect(runner.view().index).toBe(2)
  })

  it('pauses the clock, skips ahead, and exits early with a restore', () => {
    const { runner, calls } = harness(small)
    runner.start()
    vi.advanceTimersByTime(4_000)
    runner.pause()
    vi.advanceTimersByTime(60_000)
    expect(runner.view()).toMatchObject({ status: 'paused', index: 0 })
    runner.resume()
    vi.advanceTimersByTime(5_999)
    expect(runner.view().index).toBe(0)
    vi.advanceTimersByTime(1)
    expect(runner.view().index).toBe(1)
    runner.next()
    expect(runner.view().index).toBe(2)
    runner.exit()
    expect(runner.view().status).toBe('idle')
    expect(calls.slice(-2)).toEqual(['sim.end', 'camera.restore saved-view'])
    vi.advanceTimersByTime(60_000)
    expect(calls.filter((c) => c === 'camera.restore saved-view')).toHaveLength(1)
  })

  it('skips the sim scenes on real data', () => {
    const { runner, calls } = harness(small, false)
    expect(runner.steps.map((s) => s.id)).toEqual(['a', 'c'])
    runner.start()
    vi.advanceTimersByTime(20_000)
    expect(runner.view().status).toBe('idle')
    expect(calls.some((c) => c.startsWith('sim.'))).toBe(false)
  })
})

describe('default tour data', () => {
  it('is about five minutes and points at real floors', async () => {
    const seconds = defaultTour.steps.reduce((s, step) => s + step.durationSec, 0)
    expect(seconds).toBeGreaterThanOrEqual(240)
    expect(seconds).toBeLessThanOrEqual(360)
    const org = (await import('@/content/org.seed.json')).default as { departments: { key: string }[] }
    const floors = new Set(['lobby_cafe', 'games_rest', 'management', 'boss', ...org.departments.map((d) => d.key)])
    for (const step of defaultTour.steps) {
      if ('floorKey' in step.camera && step.camera.floorKey) {
        expect(floors.has(step.camera.floorKey), step.id).toBe(true)
      }
    }
  })
})

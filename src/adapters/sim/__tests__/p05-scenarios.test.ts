import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { OfficeEvent } from '@/domain/events'
import { pileFor, waitingSeatsFor } from '@/domain/selectors'
import { formatInTimeZone } from 'date-fns-tz'
import { createSimFeed } from '../SimFeed'

async function startFeed(seed: number) {
  const feed = createSimFeed({
    seed,
    autoStartTimer: false,
    bindGlobalControls: false,
  })
  await feed.start(makeSeedConfig())
  return feed
}

const ictTime = (iso: string) => formatInTimeZone(iso, 'Asia/Ho_Chi_Minh', 'HH:mm')

describe('P05-T15 demo scenarios', () => {
  it('busy_day: piles on reviewers, managers and the boss, couriers, and many people working on platform tasks', async () => {
    const feed = await startFeed(501)
    const batch = feed.runScenario('busy_day')
    expect(batch[0]?.type).toBe('sim.scenario')

    const state = feed.getState()
    const open = Object.values(state.reviews).filter((r) => r.status === 'pending')
    expect(open.length).toBeGreaterThanOrEqual(15)

    const levels = new Set(open.map((r) => r.level))
    expect(levels).toEqual(new Set(['reviewer', 'dept_manager', 'boss']))
    // The boss pile (owners) and every department manager have papers.
    expect(pileFor(state, 'emp_giam_doc').length + pileFor(state, 'emp_pho_giam_doc').length).toBeGreaterThanOrEqual(3)
    for (const mgr of ['emp_ngoc', 'emp_hai', 'emp_minh', 'emp_lan'] as const) {
      expect(pileFor(state, mgr).length).toBeGreaterThanOrEqual(2)
    }

    // Couriers: review.requested is carried by the worker.
    const requested = batch.filter(
      (e): e is OfficeEvent<'review.requested'> => e.type === 'review.requested',
    )
    expect(requested.length).toBeGreaterThanOrEqual(15)
    expect(requested.every((e) => e.actor.kind === 'employee')).toBe(true)

    const people = Object.values(state.people)
    const working = people.filter((p) => p.activity === 'working')
    expect(working.length).toBeGreaterThanOrEqual(6)
    const platforms = new Set(
      people
        .map((p) => (p.taskId ? state.tasks[p.taskId]?.platformKey : null) ?? p.platformKey)
        .filter((k): k is string => Boolean(k)),
    )
    expect([...platforms].filter((k) => ['shopee', 'zalo_oa', 'facebook'].includes(k)).length).toBeGreaterThanOrEqual(2)
    const allTaskPlatforms = new Set(Object.values(state.tasks).map((t) => t.platformKey))
    for (const key of ['shopee', 'zalo_oa', 'facebook']) {
      expect(allTaskPlatforms.has(key)).toBe(true)
    }
  })

  it('busy_day is deterministic for a seed', async () => {
    const a = await startFeed(77)
    const b = await startFeed(77)
    const ea = a.runScenario('busy_day')
    const eb = b.runScenario('busy_day')
    expect(eb.map((e) => [e.type, e.id])).toEqual(ea.map((e) => [e.type, e.id]))
  })

  it('long_queue: fills the bench outside the Marketing manager', async () => {
    const feed = await startFeed(502)
    feed.runScenario('long_queue')
    const state = feed.getState()
    const seats = waitingSeatsFor(state, 'emp_hai')
    expect(seats.length).toBeGreaterThanOrEqual(state.config.policy.approvals.questionSeatThreshold)
    expect(seats.every((q) => q.inPerson && q.status === 'open')).toBe(true)
  })

  it('lunch: jumps the clock to 11:58 and the nap starts by 12:00', async () => {
    const feed = await startFeed(503)
    const events: OfficeEvent[] = []
    feed.subscribe((b) => events.push(...b))

    const batch = feed.runScenario('lunch')
    expect(batch[0]?.type).toBe('sim.scenario')
    expect(ictTime(batch[0]!.at)).toBe('11:58')

    // No burst: skipping the morning does not fire the morning's work.
    expect(batch.length).toBe(1)

    feed.stepSimMs(3 * 60_000)
    const resting = events.filter(
      (e): e is OfficeEvent<'person.activity'> =>
        e.type === 'person.activity' && e.payload.activity === 'resting',
    )
    expect(resting.length).toBeGreaterThan(0)
    expect(resting.every((e) => ictTime(e.at) === '12:00')).toBe(true)
  })

  it('lunch after lunch has started skips to the next working day', async () => {
    const feed = await startFeed(504)
    feed.runScenario('lunch')
    feed.stepSimMs(30 * 60_000) // 12:28
    const batch = feed.runScenario('lunch')
    const at = batch[0]!.at
    expect(ictTime(at)).toBe('11:58')
    expect(formatInTimeZone(at, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd')).toBe('2026-11-03')
  })
})

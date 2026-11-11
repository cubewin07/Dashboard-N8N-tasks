import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { DEFAULT_SIM_SEED } from '../controls'
import { createSimFeed } from '../SimFeed'

const DAY_MS = 24 * 3_600_000

describe('multi-day health', () => {
  it(
    'keeps the backlog bounded and never freezes work (3 sim days)',
    async () => {
      const feed = createSimFeed({
        seed: DEFAULT_SIM_SEED,
        speed: 30,
        autoStartTimer: false,
        bindGlobalControls: false,
      })
      await feed.start(makeSeedConfig())

      let previous = new Map<string, number>()
      for (let day = 1; day <= 3; day += 1) {
        feed.stepSimMs(DAY_MS)
        const state = feed.getState()
        const tasks = Object.values(state.tasks)
        const queued = tasks.filter((t) => t.status === 'queued')
        const done = tasks.filter((t) => t.status === 'done')

        // Arrivals are ~240/day. Before the fixes 1,000 were queued by day 5
        // and only ~30 finished per day.
        expect(queued.length, `queued on day ${day}`).toBeLessThan(60)
        expect(done.length, `done by day ${day}`).toBeGreaterThanOrEqual(day * 100)

        // Nothing is frozen: a task in progress at one 08:00 must have moved
        // by the next (a full workday later). The rounding bug left long
        // tasks at 0% for good.
        const frozen = tasks.filter((t) => {
          const before = previous.get(t.id)
          return (
            before !== undefined &&
            t.status === 'in_progress' &&
            t.progress <= before
          )
        })
        expect(frozen.map((t) => t.id), `frozen on day ${day}`).toHaveLength(0)
        previous = new Map(
          tasks.filter((t) => t.status === 'in_progress').map((t) => [t.id, t.progress]),
        )

        // A worker whose task waits in review can take new work.
        const pinned = tasks.filter(
          (t) =>
            t.status === 'in_review' &&
            t.assigneeId !== null &&
            state.people[t.assigneeId]?.taskId === t.id &&
            state.people[t.assigneeId]?.activity === 'working',
        )
        expect(pinned, `workers pinned to review on day ${day}`).toHaveLength(0)
      }
    },
    120_000,
  )
})

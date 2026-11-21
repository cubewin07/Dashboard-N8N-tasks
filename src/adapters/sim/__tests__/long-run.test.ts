import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { DEFAULT_SIM_SEED } from '../controls'
import { createSimFeed } from '../SimFeed'

const DAY_MS = 24 * 3_600_000

describe('multi-day health', () => {
  it(
    'keeps the backlog bounded and never freezes work (5 sim days)',
    async () => {
      const feed = createSimFeed({
        seed: DEFAULT_SIM_SEED,
        speed: 30,
        autoStartTimer: false,
        bindGlobalControls: false,
      })
      await feed.start(makeSeedConfig())

      // Finished tasks are pruned from state after 24 sim hours, so count
      // completions from the event stream instead.
      let finishedTotal = 0
      feed.subscribe((batch) => {
        finishedTotal += batch.filter((e) => e.type === 'task.completed').length
      })

      let previous = new Map<string, number>()
      for (let day = 1; day <= 5; day += 1) {
        feed.stepSimMs(DAY_MS)
        const state = feed.getState()
        const tasks = Object.values(state.tasks)
        const queued = tasks.filter((t) => t.status === 'queued')

        // Arrivals are ~240/day. Before the fixes 1,000 were queued by day 5
        // and only ~30 finished per day.
        expect(queued.length, `queued on day ${day}`).toBeLessThan(60)
        expect(finishedTotal, `done by day ${day}`).toBeGreaterThanOrEqual(day * 100)

        // State growth (#6): finished work is pruned, so tasks and reviews
        // stop growing with the number of days (~240 tasks arrive per day).
        expect(tasks.length, `tasks in state on day ${day}`).toBeLessThan(600)
        expect(
          Object.keys(state.reviews).length,
          `reviews in state on day ${day}`,
        ).toBeLessThan(1_300)

        // Nobody approves in this run, so the boss queue only grows. Only
        // tax/legal/new-account/over-cap work, refunds and payments of
        // 3,000,000 VND or more reach the boss (about 3-4 a day, ~17 after 5
        // days; it was ~42 before issue #5 follow-up, ~75 a day before #5).
        const bossPending = Object.values(state.reviews).filter(
          (r) => r.status === 'pending' && r.level === 'boss',
        )
        expect(bossPending.length, `boss queue on day ${day}`).toBeLessThan(
          15 * day,
        )
        if (day === 5) {
          expect(bossPending.length, 'boss queue after 5 days').toBeLessThanOrEqual(25)
        }

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
    180_000,
  )
})

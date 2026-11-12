import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { OfficeEvent } from '@/domain/events'
import { createSimFeed } from '../SimFeed'

const DAY_MS = 24 * 3_600_000

async function runDays(seed: number, days: number) {
  const feed = createSimFeed({
    seed,
    speed: 30,
    autoStartTimer: false,
    bindGlobalControls: false,
  })
  const events: OfficeEvent[] = []
  await feed.start(makeSeedConfig())
  feed.subscribe((batch) => events.push(...batch))
  feed.stepSimMs(days * DAY_MS)
  return { feed, events }
}

describe('sim failure paths (R7, R9)', () => {
  it(
    'retries failing work, then fails it, and times out and escalates help',
    async () => {
      const { feed, events } = await runDays(1, 2)
      const count = (type: string) => events.filter((e) => e.type === type).length

      expect(count('task.failed')).toBeGreaterThan(0)
      expect(count('help.timed_out')).toBeGreaterThan(0)
      expect(count('help.escalated')).toBeGreaterThan(0)

      const state = feed.getState()
      const failed = Object.values(state.tasks).filter((t) => t.status === 'failed')
      expect(failed.length).toBeGreaterThan(0)
      // A failed task releases its worker for new work.
      for (const task of failed) {
        const rt = task.assigneeId ? state.people[task.assigneeId] : null
        expect(rt?.taskId).not.toBe(task.id)
      }
      // No help request is left hanging after escalation.
      for (const task of Object.values(state.tasks)) {
        if (task.status !== 'waiting_help') continue
        const open = Object.values(state.help).filter(
          (h) => h.taskId === task.id && (h.status === 'open' || h.status === 'timed_out'),
        )
        expect(open.length).toBeGreaterThan(0)
      }
    },
    60_000,
  )
})

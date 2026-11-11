import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { createSimFeed } from '../SimFeed'

const issuedBy = { userId: 'emp_giam_doc', role: 'boss' as const }

async function overCapFeed() {
  const feed = createSimFeed({
    seed: 105,
    autoStartTimer: false,
    bindGlobalControls: false,
  })
  await feed.start(makeSeedConfig())
  feed.runScenario('hire_temps')
  const state = feed.getState()
  const task = Object.values(state.tasks).find((t) => t.typeKey === 'sys.hire_over_cap')
  const reviews = Object.values(state.reviews).filter((r) => r.taskId === task?.id)
  return { feed, task, reviews }
}

describe('hire over cap (R6)', () => {
  it('goes straight to a single boss-level review', async () => {
    const { task, reviews } = await overCapFeed()
    expect(task).toBeDefined()
    expect(reviews.map((r) => r.level)).toEqual(['boss'])
  })

  it('is cancelled when the boss asks for changes, so it is never left unassigned', async () => {
    const { feed, task, reviews } = await overCapFeed()
    const ack = await feed.send({
      v: 1,
      id: 'cmd_01JCMDOVERCAP000000000001',
      type: 'review.decide',
      issuedBy,
      issuedAt: feed.now(),
      payload: {
        reviewId: reviews[0]!.id,
        decision: 'changes_requested',
        note: 'Chưa cần tuyển thêm lúc này',
      },
    })
    expect(ack.status).toBe('accepted')
    feed.stepSimMs(8 * 3_600_000)
    expect(feed.getState().tasks[task!.id]?.status).toBe('cancelled')
  })

  it('hires after the boss approves', async () => {
    const { feed, task, reviews } = await overCapFeed()
    const before = feed.getState().config.employees.length
    await feed.send({
      v: 1,
      id: 'cmd_01JCMDOVERCAP000000000002',
      type: 'review.decide',
      issuedBy,
      issuedAt: feed.now(),
      payload: { reviewId: reviews[0]!.id, decision: 'approved' },
    })
    const state = feed.getState()
    expect(state.tasks[task!.id]?.status).toBe('done')
    expect(state.config.employees.length).toBe(before + 1)
  })
})

import { describe, expect, it } from 'vitest'
import { makeEvent, makeSampleTask, makeSeedConfig, t } from '../__fixtures__/builders'
import type { Priority, ReviewId, TaskId } from '../primitives'
import { apply, initialState } from '../reducer'
import { pileFor, pileTopPriority } from '../selectors'
import type { OfficeState } from '../work'

const APPROVER = 'emp_an'

function withReview(s: OfficeState, n: number, priority: Priority, createdMin: number): OfficeState {
  const taskId = `task_pile_${n}` as TaskId
  let next = apply(
    s,
    makeEvent(
      'task.created',
      { task: makeSampleTask({ id: taskId, assigneeId: 'emp_trang', priority, createdAt: t(createdMin) }) },
      { seq: s.seq + 1, at: t(createdMin) },
    ),
  )
  next = apply(
    next,
    makeEvent(
      'review.requested',
      {
        review: {
          id: `rev_pile_${n}` as ReviewId,
          taskId,
          level: 'reviewer',
          assigneeId: APPROVER,
          status: 'pending',
          priority,
          createdAt: t(createdMin),
          decidedAt: null,
          decidedBy: null,
          note: null,
        },
      },
      { seq: next.seq + 1, at: t(createdMin) },
    ),
  )
  return next
}

describe('pileTopPriority (P05-T05, R4)', () => {
  it('is null for an empty pile', () => {
    const s = initialState(makeSeedConfig(), t(0))
    expect(pileTopPriority(s, APPROVER)).toBeNull()
  })

  it('a pile of 3 with one urgent paper shows urgent on top', () => {
    let s = initialState(makeSeedConfig(), t(0))
    s = withReview(s, 1, 'normal', 1)
    s = withReview(s, 2, 'urgent', 2)
    s = withReview(s, 3, 'low', 3)
    expect(pileFor(s, APPROVER)).toHaveLength(3)
    expect(pileTopPriority(s, APPROVER)).toBe('urgent')
  })

  it('aging promotes an old normal paper to the high band', () => {
    let s = initialState(makeSeedConfig(), t(0))
    s = withReview(s, 1, 'normal', 0)
    s = withReview(s, 2, 'low', 1)
    expect(pileTopPriority(s, APPROVER)).toBe('normal')
    // 20 points per hour: after 6 h the normal paper scores 200 + 120 = 320 ≥ high (300).
    const later: OfficeState = { ...s, now: t(6 * 60) }
    expect(pileTopPriority(later, APPROVER)).toBe('high')
  })
})

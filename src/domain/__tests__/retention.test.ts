import { describe, expect, it } from 'vitest'
import { makeEvent, makeSampleTask, makeState, t } from '../__fixtures__/builders'
import type { ReviewId, TaskId } from '../primitives'
import { apply } from '../reducer'
import { FINISHED_RETENTION_MS, crossedHour, pruneFinished } from '../retention'
import type { OfficeState, ReviewItem } from '../work'

const DAY = FINISHED_RETENTION_MS / 60_000

function tid(n: string): TaskId {
  return `task_01JTEST00000000000000${n.padStart(5, '0')}` as TaskId
}

function review(id: string, taskId: TaskId, status: ReviewItem['status']): ReviewItem {
  return {
    id: `rev_01JTEST00000000000000${id.padStart(5, '0')}` as ReviewId,
    taskId,
    level: 'boss',
    assigneeId: 'emp_mai',
    status,
    priority: 'normal',
    createdAt: t(0),
    decidedAt: status === 'pending' ? null : t(1),
    decidedBy: null,
    note: null,
  } as ReviewItem
}

function stateWith(now: number, tasks: ReturnType<typeof makeSampleTask>[], reviews: ReviewItem[]): OfficeState {
  const base = makeState()
  return {
    ...base,
    now: t(now),
    tasks: Object.fromEntries(tasks.map((x) => [x.id, x])),
    reviews: Object.fromEntries(reviews.map((r) => [r.id, r])),
  }
}

describe('pruneFinished (P03 #6)', () => {
  const oldDone = makeSampleTask({ id: tid('1'), status: 'done', finishedAt: t(5) })
  const freshDone = makeSampleTask({ id: tid('2'), status: 'done', finishedAt: t(DAY) })
  const oldWithOpenReview = makeSampleTask({ id: tid('3'), status: 'done', finishedAt: t(5) })
  const oldParent = makeSampleTask({ id: tid('4'), status: 'done', finishedAt: t(5) })
  const liveChild = makeSampleTask({ id: tid('5'), status: 'in_progress', parentTaskId: tid('4') })
  const oldFailed = makeSampleTask({ id: tid('6'), status: 'failed', finishedAt: t(5) })
  const reviews = [
    review('1', tid('1'), 'approved'),
    review('2', tid('2'), 'approved'),
    review('3', tid('3'), 'pending'),
  ]

  it('drops finished tasks past the window with their closed reviews, keeping what is still referenced', () => {
    const s = stateWith(DAY * 2, [oldDone, freshDone, oldWithOpenReview, oldParent, liveChild, oldFailed], reviews)
    const next = pruneFinished(s)
    expect(Object.keys(next.tasks).sort()).toEqual(
      [freshDone, oldWithOpenReview, oldParent, liveChild].map((x) => x.id).sort(),
    )
    expect(Object.values(next.reviews).map((r) => r.taskId).sort()).toEqual(
      [tid('2'), tid('3')].sort(),
    )
  })

  it('returns the same state object when nothing expired', () => {
    const s = stateWith(60, [freshDone, liveChild], [])
    expect(pruneFinished(s)).toBe(s)
  })

  it('runs from the reducer once per feed hour, in feed time only', () => {
    const recent = { ...freshDone, finishedAt: t(DAY * 2 - 5) }
    const s = stateWith(DAY * 2 - 1, [oldDone, recent], [review('1', tid('1'), 'approved')])
    const sameHour = apply(
      s,
      makeEvent('system.heartbeat', { source: 'sim', version: '1' }, { seq: 1, at: t(DAY * 2 - 1 + 0.5) }),
    )
    expect(Object.keys(sameHour.tasks)).toHaveLength(2)

    const nextHour = apply(
      s,
      makeEvent('system.heartbeat', { source: 'sim', version: '1' }, { seq: 1, at: t(DAY * 2 + 30) }),
    )
    expect(Object.keys(nextHour.tasks)).toEqual([recent.id])
    expect(Object.keys(nextHour.reviews)).toHaveLength(0)
  })

  it('crossedHour compares the ISO hour', () => {
    expect(crossedHour('2026-11-02T01:59:00.000Z', '2026-11-02T02:00:00.000Z')).toBe(true)
    expect(crossedHour('2026-11-02T01:10:00.000Z', '2026-11-02T01:59:00.000Z')).toBe(false)
  })
})

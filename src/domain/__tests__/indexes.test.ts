import { describe, expect, it } from 'vitest'
import { makeSampleTask } from '../__fixtures__/builders'
import { busyAssigneeIds, openReviewsByAssignee } from '../indexes'
import type { ReviewItem } from '../work'

function review(over: Partial<ReviewItem>): ReviewItem {
  return {
    id: 'rev_01JTEST000000000000000001',
    taskId: 'task_01JTEST000000000000000001',
    level: 'reviewer',
    assigneeId: 'emp_an',
    status: 'pending',
    priority: 'normal',
    createdAt: '2026-11-02T01:00:00.000Z',
    decidedAt: null,
    decidedBy: null,
    note: null,
    ...over,
  }
}

describe('domain indexes', () => {
  it('groups only open reviews by assignee and caches per record', () => {
    const a = review({})
    const b = review({ id: 'rev_01JTEST000000000000000002', status: 'approved' })
    const reviews = { [a.id]: a, [b.id]: b }
    const index = openReviewsByAssignee(reviews)
    expect(index.get('emp_an')).toEqual([a])
    expect(openReviewsByAssignee(reviews)).toBe(index)

    // The reducer replaces the record on change: a new record, a fresh index.
    const next = { ...reviews, [b.id]: { ...b, status: 'in_review' as const } }
    expect(openReviewsByAssignee(next).get('emp_an')).toHaveLength(2)
  })

  it('holds a worker through a non-boss review but not a boss review', () => {
    const task = makeSampleTask({ status: 'in_review', assigneeId: 'emp_mai' })
    const tasks = { [task.id]: task }
    const reviewer = review({ taskId: task.id, level: 'reviewer' })
    const boss = review({ taskId: task.id, level: 'boss', id: 'rev_01JTEST000000000000000009' })

    expect(busyAssigneeIds(tasks, { [reviewer.id]: reviewer }).has('emp_mai')).toBe(true)
    expect(busyAssigneeIds(tasks, { [boss.id]: boss }).has('emp_mai')).toBe(false)
  })
})

import type { EmployeeId, ReviewId, TaskId } from './primitives'
import type { ReviewItem, Task } from './work'

// The reducer replaces `state.tasks` / `state.reviews` on every change and
// never mutates them, so an index can be cached on the object's identity and
// is always consistent with the state it was built from. Callers must treat
// the returned collections as read-only.

const openByAssignee = new WeakMap<object, Map<EmployeeId, ReviewItem[]>>()

/** Pending and in-review reviews, grouped by assignee, in record order. */
export function openReviewsByAssignee(
  reviews: Record<ReviewId, ReviewItem>,
): Map<EmployeeId, ReviewItem[]> {
  const cached = openByAssignee.get(reviews)
  if (cached) return cached
  const index = new Map<EmployeeId, ReviewItem[]>()
  for (const r of Object.values(reviews)) {
    if (r.status !== 'pending' && r.status !== 'in_review') continue
    const list = index.get(r.assigneeId)
    if (list) list.push(r)
    else index.set(r.assigneeId, [r])
  }
  openByAssignee.set(reviews, index)
  return index
}

const busyByTasks = new WeakMap<
  object,
  { reviews: object; busy: Set<EmployeeId> }
>()

/**
 * Assignees who may not take another task: someone with work in flight, or
 * whose task is still in a non-boss review. A boss review does not hold the
 * worker (R9).
 */
export function busyAssigneeIds(
  tasks: Record<TaskId, Task>,
  reviews: Record<ReviewId, ReviewItem>,
): Set<EmployeeId> {
  const cached = busyByTasks.get(tasks)
  if (cached && cached.reviews === reviews) return cached.busy

  const nonBossReviewTaskIds = new Set<string>()
  for (const list of openReviewsByAssignee(reviews).values()) {
    for (const r of list) {
      if (r.level !== 'boss') nonBossReviewTaskIds.add(r.taskId)
    }
  }
  const busy = new Set<EmployeeId>()
  for (const task of Object.values(tasks)) {
    if (!task.assigneeId) continue
    if (
      task.status === 'queued' ||
      task.status === 'in_progress' ||
      task.status === 'waiting_help' ||
      task.status === 'waiting_answer' ||
      task.status === 'blocked' ||
      (task.status === 'in_review' && nonBossReviewTaskIds.has(task.id))
    ) {
      busy.add(task.assigneeId)
    }
  }
  busyByTasks.set(tasks, { reviews, busy })
  return busy
}

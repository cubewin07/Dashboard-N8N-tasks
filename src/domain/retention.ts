import type { Iso, ReviewId, TaskId } from './primitives'
import type { OfficeState, ReviewItem, Task } from './work'

/**
 * How long finished work stays in `OfficeState`, measured in feed time.
 * The activity feed only keeps the last 500 events anyway, so older finished
 * tasks and their decided reviews are dead weight that every selector pays
 * for on each event.
 */
export const FINISHED_RETENTION_MS = 24 * 3_600_000

/** Pruning runs once per feed hour (see the `system.heartbeat` case in the reducer). */
export function crossedHour(prev: Iso, next: Iso): boolean {
  return prev.slice(0, 13) !== next.slice(0, 13)
}

function isFinished(task: Task): boolean {
  return (
    task.status === 'done' ||
    task.status === 'cancelled' ||
    task.status === 'failed'
  )
}

function isOpenReview(review: ReviewItem): boolean {
  return review.status === 'pending' || review.status === 'in_review'
}

/**
 * Drops finished tasks (and their closed reviews, questions and help
 * requests) that ended before `now - FINISHED_RETENTION_MS`.
 *
 * Kept regardless of age: anything not finished, any task an open review,
 * open question, open help request or person still points at, and the
 * parent of a task that is kept. Pure and deterministic in feed time, so a
 * replay of the same events prunes at the same points. Returns the same
 * state object when nothing is removed.
 */
export function pruneFinished(state: OfficeState): OfficeState {
  const cutoff = Date.parse(state.now) - FINISHED_RETENTION_MS

  const pinned = new Set<TaskId>()
  for (const review of Object.values(state.reviews)) {
    if (isOpenReview(review)) pinned.add(review.taskId)
  }
  for (const q of Object.values(state.questions)) {
    if (q.status === 'open') pinned.add(q.taskId)
  }
  for (const h of Object.values(state.help)) {
    if (h.status === 'open' || h.status === 'accepted') pinned.add(h.taskId)
  }
  for (const person of Object.values(state.people)) {
    if (person.taskId) pinned.add(person.taskId)
  }
  for (const task of Object.values(state.tasks)) {
    if (!isFinished(task) && task.parentTaskId) pinned.add(task.parentTaskId)
  }

  const expired = new Set<TaskId>()
  for (const task of Object.values(state.tasks)) {
    if (!isFinished(task) || pinned.has(task.id)) continue
    const endedAt = Date.parse(task.finishedAt ?? task.createdAt)
    if (endedAt < cutoff) expired.add(task.id)
  }
  if (expired.size === 0) return state

  const tasks = { ...state.tasks }
  for (const id of expired) delete tasks[id]

  const reviews: Record<ReviewId, ReviewItem> = {}
  for (const [id, review] of Object.entries(state.reviews)) {
    if (!isOpenReview(review) && expired.has(review.taskId)) continue
    reviews[id as ReviewId] = review
  }

  const questions = Object.fromEntries(
    Object.entries(state.questions).filter(
      ([, q]) => q.status === 'open' || !expired.has(q.taskId),
    ),
  )
  const help = Object.fromEntries(
    Object.entries(state.help).filter(
      ([, h]) =>
        h.status === 'open' || h.status === 'accepted' || !expired.has(h.taskId),
    ),
  )

  return {
    ...state,
    tasks,
    reviews,
    questions: questions as OfficeState['questions'],
    help: help as OfficeState['help'],
  }
}

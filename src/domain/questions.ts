import type { Policy } from './config'
import type { EmployeeId, TaskId } from './primitives'
import type { OfficeState, Task } from './work'

export function canAsk(
  task: Pick<Task, 'id'> | TaskId,
  state: OfficeState,
  policy: Policy = state.config.policy,
): boolean {
  const taskId = typeof task === 'string' ? task : task.id
  let askedCount = 0
  for (const q of Object.values(state.questions)) {
    if (q.taskId === taskId) {
      askedCount += 1
    }
  }
  return askedCount < policy.work.maxQuestionsPerTask
}

export function isInPerson(
  targetId: EmployeeId,
  state: OfficeState,
  policy: Policy = state.config.policy,
): boolean {
  let openForTarget = 0
  for (const q of Object.values(state.questions)) {
    if (q.toId === targetId && q.status === 'open') {
      openForTarget += 1
    }
  }
  return openForTarget >= policy.approvals.questionSeatThreshold
}

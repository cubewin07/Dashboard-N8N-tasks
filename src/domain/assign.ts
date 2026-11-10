import type { Employee, Policy, TaskType } from './config'
import type { DepartmentId, EmployeeId } from './primitives'
import type { OfficeState, Task } from './work'

function busyAssigneeIds(state: OfficeState): Set<EmployeeId> {
  const busy = new Set<EmployeeId>()
  for (const task of Object.values(state.tasks)) {
    if (!task.assigneeId) continue
    if (
      task.status === 'queued' ||
      task.status === 'in_progress' ||
      task.status === 'in_review' ||
      task.status === 'waiting_help' ||
      task.status === 'waiting_answer' ||
      task.status === 'blocked'
    ) {
      busy.add(task.assigneeId)
    }
  }
  return busy
}

export function pickWorker(
  taskType: Pick<TaskType, 'specialty'> | string,
  departmentId: DepartmentId,
  state: OfficeState,
): EmployeeId | null {
  const specialty =
    typeof taskType === 'string'
      ? (state.config.taskTypes.find((tt) => tt.key === taskType)?.specialty ??
        taskType)
      : taskType.specialty

  const roleMap = new Map(state.config.roles.map((r) => [r.key, r]))
  const busyIds = state.config.policy.work.oneActiveTaskPerWorker
    ? busyAssigneeIds(state)
    : new Set<EmployeeId>()

  const candidates: Array<{
    emp: Employee
    isDedicatedWorker: boolean
    lastActiveMs: number
  }> = []

  for (const emp of state.config.employees) {
    if (emp.state !== 'active' || emp.departmentId !== departmentId) continue
    if (!emp.specialties.includes(specialty)) continue
    if (busyIds.has(emp.id)) continue

    const role = roleMap.get(emp.roleKey)
    if (!role || !role.caps.doWork || role.caps.humanOwner) continue

    const runtime = state.people[emp.id]
    if (!runtime || runtime.activity !== 'idle' || runtime.taskId !== null) {
      continue
    }

    candidates.push({
      emp,
      isDedicatedWorker: !role.caps.distributeReviews,
      lastActiveMs: Date.parse(runtime.lastActiveAt),
    })
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    if (a.isDedicatedWorker !== b.isDedicatedWorker) {
      return a.isDedicatedWorker ? -1 : 1
    }
    if (a.lastActiveMs !== b.lastActiveMs) {
      return a.lastActiveMs - b.lastActiveMs
    }
    return a.emp.id < b.emp.id ? -1 : a.emp.id > b.emp.id ? 1 : 0
  })

  return candidates[0]!.emp.id
}

export function canRetryTask(
  task: Pick<Task, 'attempts'>,
  policy: Policy,
): boolean {
  return task.attempts <= policy.work.maxRetries
}

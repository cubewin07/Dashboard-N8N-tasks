import type { OwnerKey, Tables } from '@/lib/database.types'
import { taskTabs, type TaskTab } from '@/lib/status'

export const TASK_TAB_ORDER: TaskTab[] = ['active', 'waiting', 'blocked', 'done', 'all']

export function parseTabParam(raw: string | null): TaskTab {
  if (raw && raw in taskTabs) return raw as TaskTab
  return 'active'
}

/** Current step owner, or first step's owner when current_step_key is null. */
export function resolveTaskOwner(task: Tables<'tasks'>, steps: Tables<'task_steps'>[]): OwnerKey {
  if (task.current_step_key) {
    const current = steps.find((s) => s.step_key === task.current_step_key)
    if (current) return current.owner_key
  }
  return steps[0]?.owner_key ?? 'thu'
}

export function taskMatchesEmployee(
  task: Tables<'tasks'>,
  steps: Tables<'task_steps'>[],
  employeeKey: string,
): boolean {
  if (!employeeKey || employeeKey === 'all') return true
  if (resolveTaskOwner(task, steps) === employeeKey) return true
  return steps.some((s) => s.owner_key === employeeKey)
}

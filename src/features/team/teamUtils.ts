import type { EmployeeKey, Tables } from '@/lib/database.types'
import type { Messages } from '@/i18n/vi'
import { isTodayICT } from '@/lib/time'
import { fmt } from '@/lib/utils'

export interface EmployeeTodayStats {
  done: number
  failed: number
  avgMinutes: number | null
}

/**
 * Compute today's numbers (done / failed / average time in minutes)
 * from tasks + task_steps where the employee owns steps, finished today (ICT).
 */
export function computeEmployeeTodayStats(
  employeeKey: EmployeeKey,
  tasks: Tables<'tasks'>[],
  allSteps: Tables<'task_steps'>[],
): EmployeeTodayStats {
  const empSteps = allSteps.filter((s) => s.owner_key === employeeKey)
  const taskIdsOwned = new Set(empSteps.map((s) => s.task_id))

  let done = 0
  let failed = 0
  const durationsMs: number[] = []

  for (const task of tasks) {
    if (!taskIdsOwned.has(task.id)) continue
    if (!task.finished_at || !isTodayICT(task.finished_at)) continue

    if (task.status === 'done') {
      done += 1
      const diff = Date.parse(task.finished_at) - Date.parse(task.created_at)
      if (diff > 0) durationsMs.push(diff)
    } else if (task.status === 'failed') {
      const empFailedStep = empSteps.some((s) => s.task_id === task.id && s.status === 'failed')
      if (empFailedStep) {
        failed += 1
      }
    }
  }

  // Also include completed step durations today if no full task duration was recorded yet
  if (durationsMs.length === 0) {
    for (const step of empSteps) {
      if (step.status === 'done' && step.started_at && step.finished_at && isTodayICT(step.finished_at)) {
        const diff = Date.parse(step.finished_at) - Date.parse(step.started_at)
        if (diff > 0) durationsMs.push(diff)
      }
    }
  }

  const avgMinutes =
    durationsMs.length > 0
      ? Math.max(1, Math.round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length / 60_000))
      : null

  return { done, failed, avgMinutes }
}

/** Build plain-language sentence for a risky workflow step unlocked by works_alone. */
export function describeRiskyStep(
  employeeName: string,
  step: Tables<'workflow_steps'>,
  t: Messages,
): string {
  const template = t.team.riskyUnlocks[step.key]
  if (template) {
    return fmt(template, { name: employeeName })
  }
  const stepLabel = t.common.steps[step.key] ?? step.label
  return fmt(t.team.riskyUnlocks.fallback, { name: employeeName, step: stepLabel })
}

import { useMemo } from 'react'
import { PageHeader } from '@/components'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAllTaskSteps,
  useEmployees,
  useTasks,
  useWorkflowSteps,
} from '@/hooks/queries'
import type { EmployeeKey, Tables } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { TeamMemberCard } from './TeamMemberCard'
import { computeEmployeeTodayStats } from './teamUtils'

export function TeamPage() {
  const { t } = useI18n()
  const employeesQuery = useEmployees()
  const workflowStepsQuery = useWorkflowSteps()
  const tasksQuery = useTasks()
  const allTaskStepsQuery = useAllTaskSteps()

  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data])
  const workflowSteps = useMemo(() => workflowStepsQuery.data ?? [], [workflowStepsQuery.data])
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const allTaskSteps = useMemo(() => allTaskStepsQuery.data ?? [], [allTaskStepsQuery.data])

  const skillsByEmployee = useMemo(() => {
    const map = new Map<EmployeeKey, string[]>()
    for (const step of workflowSteps) {
      if (step.owner_key === 'boss') continue
      const list = map.get(step.owner_key) ?? []
      if (!list.includes(step.workflow_key)) {
        list.push(step.workflow_key)
      }
      map.set(step.owner_key, list)
    }
    return map
  }, [workflowSteps])

  const riskyByEmployee = useMemo(() => {
    const map = new Map<EmployeeKey, Tables<'workflow_steps'>[]>()
    for (const step of workflowSteps) {
      if (!step.risky || step.owner_key === 'boss') continue
      const list = map.get(step.owner_key) ?? []
      list.push(step)
      map.set(step.owner_key, list)
    }
    return map
  }, [workflowSteps])

  const isLoading =
    employeesQuery.isLoading ||
    workflowStepsQuery.isLoading ||
    tasksQuery.isLoading ||
    allTaskStepsQuery.isLoading

  return (
    <div className="flex flex-col gap-5 pb-8">
      <PageHeader title={t.team.title} description={t.team.description} />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {employees.map((emp) => {
            const workflowKeys = skillsByEmployee.get(emp.key) ?? []
            const riskySteps = riskyByEmployee.get(emp.key) ?? []
            const stats = computeEmployeeTodayStats(emp.key, tasks, allTaskSteps)

            return (
              <TeamMemberCard
                key={emp.key}
                employee={emp}
                workflowKeys={workflowKeys}
                riskySteps={riskySteps}
                stats={stats}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAllTaskSteps,
  useApprovals,
  useEmployees,
  useEvents,
  useLookups,
  useShops,
  useTasks,
} from '@/hooks/queries'
import type { EmployeeKey, Tables } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { ByShopCard } from './ByShopCard'
import { EmployeeCard } from './EmployeeCard'
import { EmployeeDrawer } from './EmployeeDrawer'
import { LiveActivityCard } from './LiveActivityCard'
import { NeedsYouStrip } from './NeedsYouStrip'
import { StatTiles } from './StatTiles'

export function OverviewPage() {
  const { t } = useI18n()
  const employeesQuery = useEmployees()
  const tasksQuery = useTasks()
  const allStepsQuery = useAllTaskSteps()
  const approvalsQuery = useApprovals()
  const eventsQuery = useEvents(15)
  const allEventsQuery = useEvents(100)
  const shopsQuery = useShops()
  const { shop: shopMap, employee: employeeMap } = useLookups()

  const [selectedEmpKey, setSelectedEmpKey] = useState<EmployeeKey | null>(null)

  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data])
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const allSteps = useMemo(() => allStepsQuery.data ?? [], [allStepsQuery.data])
  const approvals = useMemo(() => approvalsQuery.data ?? [], [approvalsQuery.data])
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data])
  const allEvents = useMemo(() => allEventsQuery.data ?? [], [allEventsQuery.data])
  const shops = useMemo(() => shopsQuery.data ?? [], [shopsQuery.data])

  const taskMap = useMemo(() => new Map(tasks.map((tk) => [tk.id, tk])), [tasks])

  const stepsByTask = useMemo(() => {
    const map = new Map<number, Tables<'task_steps'>[]>()
    for (const s of allSteps) {
      const list = map.get(s.task_id) ?? []
      list.push(s)
      map.set(s.task_id, list)
    }
    for (const [k, list] of map.entries()) {
      map.set(
        k,
        [...list].sort((a, b) => a.position - b.position),
      )
    }
    return map
  }, [allSteps])

  const openApprovalByTask = useMemo(() => {
    const map = new Map<number, number>()
    for (const a of approvals) {
      if (a.status === 'open' && !map.has(a.task_id)) {
        map.set(a.task_id, a.id)
      }
    }
    return map
  }, [approvals])

  const selectedEmployee = selectedEmpKey ? (employeeMap.get(selectedEmpKey) ?? null) : null
  const isLoading = employeesQuery.isLoading || tasksQuery.isLoading

  return (
    <div className="flex flex-col gap-6 pb-8">
      <h1 className="sr-only">{t.overview.title}</h1>

      <NeedsYouStrip />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <StatTiles tasks={tasks} />
      )}

      <section aria-labelledby="overview-team-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 id="overview-team-heading" className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {t.overview.teamSection.title}
          </h2>
          <p className="text-xs text-muted-foreground">{t.overview.teamSection.subtitle}</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {employees.map((emp) => {
              const currentTask = emp.current_task_id ? taskMap.get(emp.current_task_id) : undefined
              const taskSteps = currentTask ? (stepsByTask.get(currentTask.id) ?? []) : []
              const shopName = currentTask ? shopMap.get(currentTask.shop_id)?.name : undefined
              const openApprovalId = currentTask ? openApprovalByTask.get(currentTask.id) : undefined

              return (
                <EmployeeCard
                  key={emp.key}
                  employee={emp}
                  currentTask={currentTask}
                  taskSteps={taskSteps}
                  shopName={shopName}
                  openApprovalId={openApprovalId}
                  onSelect={(key) => setSelectedEmpKey(key)}
                />
              )
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <LiveActivityCard events={events} employeeMap={employeeMap} />
        </div>
        <div className="lg:col-span-5">
          <ByShopCard shops={shops} tasks={tasks} />
        </div>
      </div>

      <EmployeeDrawer
        employee={selectedEmployee}
        open={Boolean(selectedEmployee)}
        onOpenChange={(open) => {
          if (!open) setSelectedEmpKey(null)
        }}
        tasks={tasks}
        stepsByTask={stepsByTask}
        shopMap={shopMap}
        employeeMap={employeeMap}
        events={allEvents}
        approvals={approvals}
      />
    </div>
  )
}

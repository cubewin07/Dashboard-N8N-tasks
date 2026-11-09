import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock, ListChecks, OctagonAlert, PlayCircle, Plus } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStartWork } from '@/app/startWork'
import {
  useAllTaskSteps,
  useEmployees,
  useLookups,
  useShops,
  useTasks,
  useWorkflows,
} from '@/hooks/queries'
import type { Tables, TaskStatus } from '@/lib/database.types'
import { taskTabs, type TaskTab } from '@/lib/status'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { TaskCardList } from './list/TaskCardList'
import { TaskFiltersBar } from './list/TaskFiltersBar'
import { TasksTable } from './list/TasksTable'
import { TASK_TAB_ORDER, parseTabParam, taskMatchesEmployee } from './list/taskListUtils'

const TAB_ICONS = {
  active: PlayCircle,
  waiting: Clock,
  blocked: OctagonAlert,
  done: CheckCircle2,
  all: ListChecks,
} as const

export function TasksPage() {
  const { t } = useI18n()
  const { openStartWork } = useStartWork()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = parseTabParam(searchParams.get('tab'))
  const shopFilter = searchParams.get('shop') ?? 'all'
  const workflowFilter = searchParams.get('workflow') ?? 'all'
  const employeeFilter = searchParams.get('employee') ?? 'all'

  const tasksQuery = useTasks()
  const allStepsQuery = useAllTaskSteps()
  const shopsQuery = useShops()
  const workflowsQuery = useWorkflows()
  const employeesQuery = useEmployees()
  const { shop: shopMap, employee: employeeMap } = useLookups()

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const allSteps = useMemo(() => allStepsQuery.data ?? [], [allStepsQuery.data])
  const shops = useMemo(() => shopsQuery.data ?? [], [shopsQuery.data])
  const workflows = useMemo(() => workflowsQuery.data ?? [], [workflowsQuery.data])
  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data])

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

  const updateParam = (key: string, value: string, defaultVal = 'all') => {
    const next = new URLSearchParams(searchParams)
    if (value === defaultVal) {
      next.delete(key)
    } else {
      next.set(key, value)
    }
    setSearchParams(next, { replace: true })
  }

  const resetFilters = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('shop')
    next.delete('workflow')
    next.delete('employee')
    setSearchParams(next, { replace: true })
  }

  const tasksMatchingFilters = useMemo(() => {
    return tasks.filter((task) => {
      if (shopFilter !== 'all' && String(task.shop_id) !== shopFilter) return false
      if (workflowFilter !== 'all' && task.workflow_key !== workflowFilter) return false
      const steps = stepsByTask.get(task.id) ?? []
      if (!taskMatchesEmployee(task, steps, employeeFilter)) return false
      return true
    })
  }, [tasks, shopFilter, workflowFilter, employeeFilter, stepsByTask])

  const tabCounts = useMemo(() => {
    const counts: Record<TaskTab, number> = { active: 0, waiting: 0, blocked: 0, done: 0, all: 0 }
    for (const task of tasksMatchingFilters) {
      for (const tabKey of TASK_TAB_ORDER) {
        const allowed = taskTabs[tabKey] as TaskStatus[]
        if (allowed.includes(task.status)) {
          counts[tabKey] += 1
        }
      }
    }
    return counts
  }, [tasksMatchingFilters])

  const visibleTasks = useMemo(() => {
    const allowed = taskTabs[activeTab] as TaskStatus[]
    return tasksMatchingFilters.filter((task) => allowed.includes(task.status))
  }, [tasksMatchingFilters, activeTab])

  const hasActiveFilter = shopFilter !== 'all' || workflowFilter !== 'all' || employeeFilter !== 'all'
  const isLoading = tasksQuery.isLoading || allStepsQuery.isLoading

  return (
    <div className="flex flex-col gap-5 pb-8">
      <PageHeader
        title={t.tasks.title}
        description={t.tasks.description}
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={() =>
              openStartWork({
                workflowKey: workflowFilter !== 'all' ? workflowFilter : undefined,
                shopId: shopFilter !== 'all' ? Number(shopFilter) : undefined,
              })
            }
          >
            <Plus className="size-4" aria-hidden />
            {t.tasks.newTaskButton.replace(/^\+\s*/, '')}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Tabs value={activeTab} onValueChange={(v) => updateParam('tab', v, 'active')}>
          <TabsList aria-label={t.tasks.title}>
            {TASK_TAB_ORDER.map((tab) => {
              const count = tabCounts[tab]
              return (
                <TabsTrigger key={tab} value={tab}>
                  <span>{t.tasks.tabs[tab]}</span>
                  <span
                    className={cn(
                      'tabular inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold',
                      activeTab === tab
                        ? 'bg-primary-soft text-primary'
                        : 'bg-surface text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        <TaskFiltersBar
          shops={shops}
          workflows={workflows}
          employees={employees}
          shopFilter={shopFilter}
          workflowFilter={workflowFilter}
          employeeFilter={employeeFilter}
          onShopChange={(v) => updateParam('shop', v)}
          onWorkflowChange={(v) => updateParam('workflow', v)}
          onEmployeeChange={(v) => updateParam('employee', v)}
          onReset={resetFilters}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : visibleTasks.length === 0 ? (
        <EmptyState
          icon={TAB_ICONS[activeTab]}
          title={t.tasks.empty[activeTab].title}
          description={t.tasks.empty[activeTab].description}
          action={
            hasActiveFilter ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                {t.tasks.filters.reset}
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => openStartWork()}>
                <Plus className="size-4" aria-hidden />
                {t.common.actions.startWork}
              </Button>
            )
          }
        />
      ) : (
        <>
          <TasksTable
            tasks={visibleTasks}
            stepsByTask={stepsByTask}
            employeeMap={employeeMap}
            shopMap={shopMap}
          />
          <TaskCardList
            tasks={visibleTasks}
            stepsByTask={stepsByTask}
            employeeMap={employeeMap}
          />
        </>
      )}
    </div>
  )
}

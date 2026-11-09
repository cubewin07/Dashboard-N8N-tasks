import { Link, useNavigate } from 'react-router-dom'
import {
  EmployeeAvatar,
  ShopChip,
  StatusPill,
  StepDots,
  TimeAgo,
  WorkflowIcon,
} from '@/components'
import type { Tables } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { resolveTaskOwner } from './taskListUtils'

interface TasksTableProps {
  tasks: Tables<'tasks'>[]
  stepsByTask: Map<number, Tables<'task_steps'>[]>
  employeeMap: Map<string, Tables<'employees'>>
  shopMap: Map<number, Tables<'shops'>>
}

export function TasksTable({ tasks, stepsByTask, employeeMap, shopMap }: TasksTableProps) {
  const { t } = useI18n()
  const navigate = useNavigate()

  return (
    <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)] md:block">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="px-4 py-3">
              {t.tasks.columns.id}
            </th>
            <th scope="col" className="px-4 py-3">
              {t.tasks.columns.workflow}
            </th>
            <th scope="col" className="px-4 py-3">
              {t.tasks.columns.shop}
            </th>
            <th scope="col" className="px-4 py-3">
              {t.tasks.columns.owner}
            </th>
            <th scope="col" className="px-4 py-3">
              {t.tasks.columns.steps}
            </th>
            <th scope="col" className="px-4 py-3">
              {t.tasks.columns.status}
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              {t.tasks.columns.updated}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {tasks.map((task) => {
            const steps = stepsByTask.get(task.id) ?? []
            const ownerKey = resolveTaskOwner(task, steps)
            const ownerName = ownerKey === 'boss' ? t.common.you : (employeeMap.get(ownerKey)?.name ?? ownerKey)
            const wfShort =
              t.common.workflows[task.workflow_key as keyof typeof t.common.workflows]?.short ?? task.workflow_key
            const shopName = shopMap.get(task.shop_id)?.name ?? `#${task.shop_id}`
            const rowAria = fmt(t.tasks.rowAria, { id: task.id, workflow: wfShort, shop: shopName })

            return (
              <tr
                key={task.id}
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (target.closest('a, button')) return
                  navigate(`/tasks/${task.id}`)
                }}
                className="group cursor-pointer transition-colors hover:bg-surface-muted/50"
              >
                <td className="whitespace-nowrap px-4 py-3.5 font-semibold">
                  <Link
                    to={`/tasks/${task.id}`}
                    aria-label={rowAria}
                    className="tabular rounded-md text-foreground group-hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    #{task.id}
                  </Link>
                </td>
                <td className="max-w-[240px] px-4 py-3.5">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <WorkflowIcon workflowKey={task.workflow_key} className="text-muted-foreground" />
                    <span className="truncate">{wfShort}</span>
                  </div>
                  {task.brief && <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.brief}</p>}
                  {task.blocked_reason && (
                    <p className="mt-0.5 truncate text-xs font-medium text-blocked">{task.blocked_reason}</p>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  <ShopChip shopId={task.shop_id} />
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  <div className="inline-flex items-center gap-2">
                    <EmployeeAvatar ownerKey={ownerKey} size="sm" />
                    <span className="text-xs font-medium text-foreground sm:text-sm">{ownerName}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  {steps.length > 0 && <StepDots steps={steps} showCount />}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5">
                  <StatusPill kind="task" status={task.status} size="sm" />
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right text-xs text-muted-foreground">
                  <TimeAgo iso={task.updated_at} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

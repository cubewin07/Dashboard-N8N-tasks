import { Link } from 'react-router-dom'
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
import { resolveTaskOwner } from './taskListUtils'

interface TaskCardListProps {
  tasks: Tables<'tasks'>[]
  stepsByTask: Map<number, Tables<'task_steps'>[]>
  employeeMap: Map<string, Tables<'employees'>>
}

export function TaskCardList({ tasks, stepsByTask, employeeMap }: TaskCardListProps) {
  const { t } = useI18n()

  return (
    <ul role="list" className="flex flex-col gap-3 md:hidden">
      {tasks.map((task) => {
        const steps = stepsByTask.get(task.id) ?? []
        const ownerKey = resolveTaskOwner(task, steps)
        const ownerName = ownerKey === 'boss' ? t.common.you : (employeeMap.get(ownerKey)?.name ?? ownerKey)
        const wfShort =
          t.common.workflows[task.workflow_key as keyof typeof t.common.workflows]?.short ?? task.workflow_key

        return (
          <li key={task.id}>
            <Link
              to={`/tasks/${task.id}`}
              className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-soft)] transition-colors hover:bg-surface-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="tabular text-sm font-semibold text-foreground">#{task.id}</span>
                  <span aria-hidden className="text-muted-foreground">·</span>
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                    <WorkflowIcon workflowKey={task.workflow_key} className="text-muted-foreground" />
                    <span className="truncate">{wfShort}</span>
                  </span>
                </div>
                <StatusPill kind="task" status={task.status} size="sm" />
              </div>

              {task.brief && <p className="line-clamp-2 text-xs text-muted-foreground">{task.brief}</p>}
              {task.blocked_reason && (
                <p className="rounded-lg bg-blocked-soft px-2.5 py-1.5 text-xs font-medium text-blocked">
                  {task.blocked_reason}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShopChip shopId={task.shop_id} />
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <EmployeeAvatar ownerKey={ownerKey} size="sm" />
                    <span>{ownerName}</span>
                  </span>
                </div>
                <TimeAgo iso={task.updated_at} className="text-xs text-muted-foreground" />
              </div>

              {steps.length > 0 && (
                <div className="border-t border-border/60 pt-2.5">
                  <StepDots steps={steps} showCount />
                </div>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

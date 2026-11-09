import { Link } from 'react-router-dom'
import { EmployeeAvatar, StatusPill, StepDots, TimeAgo } from '@/components'
import type { EmployeeKey, Tables } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { buildEmployeeDoingLine } from './overviewUtils'

interface EmployeeCardProps {
  employee: Tables<'employees'>
  currentTask?: Tables<'tasks'>
  taskSteps: Tables<'task_steps'>[]
  shopName?: string
  openApprovalId?: number
  onSelect: (key: EmployeeKey) => void
}

export function EmployeeCard({
  employee,
  currentTask,
  taskSteps,
  shopName,
  openApprovalId,
  onSelect,
}: EmployeeCardProps) {
  const { t, lang } = useI18n()
  const roleLabel = t.common.roles[employee.role_key as keyof typeof t.common.roles] ?? employee.role_key
  const statusLabel = t.common.empStatus[employee.status]
  const doingLine = buildEmployeeDoingLine(employee, currentTask, shopName, t, lang)
  const cardAria = fmt(t.overview.teamSection.cardAria, {
    name: employee.name,
    role: roleLabel,
    status: statusLabel,
  })

  const stateKey = `${employee.status}-${employee.current_task_id ?? 'idle'}-${employee.current_step_key ?? 'none'}`

  const inboxHref =
    employee.status === 'waiting_boss' && currentTask
      ? openApprovalId
        ? `/inbox?item=approval-${openApprovalId}`
        : `/inbox?item=task-${currentTask.id}`
      : employee.status === 'blocked' && currentTask
        ? `/inbox?item=task-${currentTask.id}`
        : null

  return (
    <article className="group relative flex flex-col justify-between gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-soft)] transition-colors hover:border-primary/40 hover:bg-surface-muted/30 sm:p-5">
      <button
        type="button"
        aria-label={cardAria}
        onClick={() => onSelect(employee.key)}
        className="absolute inset-0 z-0 cursor-pointer rounded-[var(--radius-card)] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />

      <div className="pointer-events-none relative z-10 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <EmployeeAvatar ownerKey={employee.key} size="lg" status={employee.status} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold leading-snug text-foreground">{employee.name}</h3>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{roleLabel}</p>
          </div>
        </div>

        <div key={stateKey} className="animate-fade-in flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <StatusPill kind="emp" status={employee.status} size="sm" />
            <span aria-hidden>·</span>
            <TimeAgo iso={employee.status_since} className="text-xs text-muted-foreground" />
          </div>

          <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium text-foreground">{doingLine}</p>

          {currentTask && taskSteps.length > 0 ? (
            <div className="pt-0.5">
              <StepDots steps={taskSteps} showCount />
            </div>
          ) : (
            <div className="h-5" aria-hidden />
          )}
        </div>
      </div>

      <div className="pointer-events-none relative z-10 flex items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden>{employee.autonomy === 'ask_first' ? '🔒' : '🔓'}</span>
          <span>{t.common.autonomy[employee.autonomy]}</span>
        </span>

        {inboxHref && (
          <Link
            to={inboxHref}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto inline-flex items-center gap-1 rounded-lg bg-waiting-soft px-2.5 py-1 text-xs font-semibold text-waiting transition-colors hover:bg-waiting/20 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {employee.status === 'waiting_boss' ? t.overview.teamSection.reviewAction : t.overview.teamSection.blockedAction}
          </Link>
        )}
      </div>
    </article>
  )
}

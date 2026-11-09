import { Link } from 'react-router-dom'
import {
  EmployeeAvatar,
  ShopChip,
  StatusPill,
  StepDots,
  TimeAgo,
  WorkflowIcon,
} from '@/components'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { OwnerKey, Tables } from '@/lib/database.types'
import { formatTime, isTodayICT } from '@/lib/time'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { buildEmployeeDoingLine, formatEventMessage } from './overviewUtils'

interface EmployeeDrawerProps {
  employee: Tables<'employees'> | null
  open: boolean
  onOpenChange: (open: boolean) => void
  tasks: Tables<'tasks'>[]
  stepsByTask: Map<number, Tables<'task_steps'>[]>
  shopMap: Map<number, Tables<'shops'>>
  employeeMap: Map<string, Tables<'employees'>>
  events: Tables<'events'>[]
  approvals: Tables<'approvals'>[]
}

export function EmployeeDrawer({
  employee,
  open,
  onOpenChange,
  tasks,
  stepsByTask,
  shopMap,
  employeeMap,
  events,
  approvals,
}: EmployeeDrawerProps) {
  const { t, lang } = useI18n()

  if (!employee) return null

  const roleLabel = t.common.roles[employee.role_key as keyof typeof t.common.roles] ?? employee.role_key
  const currentTask = employee.current_task_id ? tasks.find((tk) => tk.id === employee.current_task_id) : undefined
  const currentTaskSteps = currentTask ? (stepsByTask.get(currentTask.id) ?? []) : []
  const currentShopName = currentTask ? shopMap.get(currentTask.shop_id)?.name : undefined
  const doingLine = buildEmployeeDoingLine(employee, currentTask, currentShopName, t, lang)

  const openApproval = currentTask
    ? approvals.find((a) => a.task_id === currentTask.id && a.status === 'open')
    : undefined

  const inboxLink =
    currentTask && employee.status === 'waiting_boss'
      ? openApproval
        ? `/inbox?item=approval-${openApproval.id}`
        : `/inbox?item=task-${currentTask.id}`
      : currentTask && employee.status === 'blocked'
        ? `/inbox?item=task-${currentTask.id}`
        : null

  const queuedTasks = tasks.filter((tk) => {
    if (tk.status !== 'queued') return false
    const steps = stepsByTask.get(tk.id) ?? []
    return steps.some((s) => s.owner_key === employee.key)
  })

  const todayEvents = events.filter((ev) => ev.actor === employee.key && isTodayICT(ev.at))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <div className="flex items-center gap-3">
            <EmployeeAvatar ownerKey={employee.key} size="lg" status={employee.status} />
            <div className="min-w-0 flex-1">
              <SheetTitle>{employee.name}</SheetTitle>
              <SheetDescription>{roleLabel}</SheetDescription>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusPill kind="emp" status={employee.status} size="sm" />
            <span aria-hidden>·</span>
            <TimeAgo iso={employee.status_since} />
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-6 p-4 sm:p-6">
          {/* Current task */}
          <section className="flex flex-col gap-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t.overview.drawer.currentTask}
            </h3>
            {currentTask ? (
              <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-muted/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <WorkflowIcon workflowKey={currentTask.workflow_key} />
                    <span>
                      {t.common.workflows[currentTask.workflow_key as keyof typeof t.common.workflows]?.name ??
                        currentTask.workflow_key}
                    </span>
                    <span className="tabular text-muted-foreground">#{currentTask.id}</span>
                  </span>
                  <ShopChip shopId={currentTask.shop_id} />
                </div>

                <p className="text-sm text-foreground">{doingLine}</p>
                {currentTask.brief && <p className="text-xs text-muted-foreground">“{currentTask.brief}”</p>}
                {currentTask.blocked_reason && (
                  <p className="rounded-lg bg-blocked-soft px-3 py-2 text-xs font-medium text-blocked">
                    {currentTask.blocked_reason}
                  </p>
                )}

                {currentTaskSteps.length > 0 && <StepDots steps={currentTaskSteps} showCount />}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Link
                    to={`/tasks/${currentTask.id}`}
                    onClick={() => onOpenChange(false)}
                    className="text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {fmt(t.overview.drawer.viewTaskDetail, { id: currentTask.id })}
                  </Link>
                  {inboxLink && (
                    <Link
                      to={inboxLink}
                      onClick={() => onOpenChange(false)}
                      className="inline-flex items-center rounded-lg bg-waiting-soft px-2.5 py-1 text-xs font-semibold text-waiting hover:bg-waiting/20 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {t.overview.drawer.openInInbox}
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-[var(--radius-card)] border border-dashed border-border p-4 text-sm text-muted-foreground">
                {t.overview.drawer.noCurrentTask}
              </p>
            )}
          </section>

          {/* Queue */}
          <section className="flex flex-col gap-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {fmt(t.overview.drawer.queueTitle, { n: queuedTasks.length })}
            </h3>
            {queuedTasks.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {queuedTasks.map((qt) => (
                  <li key={qt.id}>
                    <Link
                      to={`/tasks/${qt.id}`}
                      onClick={() => onOpenChange(false)}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <WorkflowIcon workflowKey={qt.workflow_key} />
                          <span className="truncate">
                            {t.common.workflows[qt.workflow_key as keyof typeof t.common.workflows]?.short ?? qt.workflow_key}
                          </span>
                          <span className="tabular text-xs text-muted-foreground">#{qt.id}</span>
                        </div>
                        {qt.brief && <p className="mt-0.5 truncate text-xs text-muted-foreground">{qt.brief}</p>}
                      </div>
                      <ShopChip shopId={qt.shop_id} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-[var(--radius-card)] border border-dashed border-border p-4 text-sm text-muted-foreground">
                {t.overview.drawer.queueEmpty}
              </p>
            )}
          </section>

          {/* Today's history */}
          <section className="flex flex-col gap-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {fmt(t.overview.drawer.todayHistory, { n: todayEvents.length })}
            </h3>
            {todayEvents.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
                {todayEvents.map((ev) => {
                  const msg = formatEventMessage(ev, t, employeeMap)
                  return (
                    <li key={ev.id} className="flex items-start gap-3 px-3.5 py-2.5 text-sm">
                      <time dateTime={ev.at} className="tabular shrink-0 pt-0.5 text-xs text-muted-foreground">
                        {formatTime(ev.at)}
                      </time>
                      <div className="min-w-0 flex-1">
                        {ev.task_id ? (
                          <Link
                            to={`/tasks/${ev.task_id}`}
                            onClick={() => onOpenChange(false)}
                            className="text-foreground hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            {msg}
                          </Link>
                        ) : (
                          <span className="text-foreground">{msg}</span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="rounded-[var(--radius-card)] border border-dashed border-border p-4 text-sm text-muted-foreground">
                {t.overview.drawer.historyEmpty}
              </p>
            )}
          </section>

          {/* Autonomy summary */}
          <section className="flex flex-col gap-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t.overview.drawer.autonomyTitle}
            </h3>
            <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface-muted/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <span aria-hidden>{employee.autonomy === 'ask_first' ? '🔒' : '🔓'}</span>
                  <span>{t.common.autonomy[employee.autonomy]}</span>
                </span>
                <EmployeeAvatar ownerKey={employee.key as OwnerKey} size="sm" />
              </div>
              <p className="text-xs text-muted-foreground">
                {employee.autonomy === 'ask_first'
                  ? t.overview.drawer.autonomyAskFirstDesc
                  : t.overview.drawer.autonomyWorksAloneDesc}
              </p>
              <div className="pt-1">
                <Link
                  to="/team"
                  onClick={() => onOpenChange(false)}
                  className="text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {t.overview.drawer.manageInTeam}
                </Link>
              </div>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowUpRight, RotateCcw, X } from 'lucide-react'
import type { OwnerKey, Tables } from '@/lib/database.types'
import { useLookups } from '@/hooks/queries'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { CommandButton, EmployeeAvatar, ShopChip, StatusPill, StepTimeline, TimeAgo, WorkflowIcon } from '@/components'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function BlockedTaskDetailPane({
  task,
  taskSteps,
  ownerKey,
  onApplied,
}: {
  task: Tables<'tasks'>
  taskSteps: Tables<'task_steps'>[]
  ownerKey: OwnerKey
  onApplied: () => void
}) {
  const { t } = useI18n()
  const { employee } = useLookups()
  const [cancelOpen, setCancelOpen] = useState(false)

  const wfMap = t.common.workflows as Record<string, { name: string; short: string } | undefined>
  const wfName = wfMap[task.workflow_key]?.name ?? task.workflow_key
  const ownerName = ownerKey === 'boss' ? t.common.you : (employee.get(ownerKey)?.name ?? ownerKey)

  const stuckStep =
    taskSteps.find((s) => s.step_key === task.current_step_key) ??
    taskSteps.find((s) => s.status === 'failed' || s.status === 'stuck')

  return (
    <Card className="flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusPill kind="task" status={task.status} size="sm" />
          <ShopChip shopId={task.shop_id} />
          <Link
            to={`/tasks/${task.id}`}
            className="tabular inline-flex items-center rounded-md border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            #{task.id}
          </Link>
          <TimeAgo iso={task.updated_at} className="ml-auto text-xs text-muted-foreground" />
        </div>

        <h2 className="mt-2.5 flex items-center gap-2 text-lg font-semibold leading-snug text-foreground sm:text-xl">
          <WorkflowIcon workflowKey={task.workflow_key} className="size-5 text-blocked" />
          <span>
            {t.inbox.list.blockedPrefix}: {wfName}
          </span>
        </h2>

        {task.brief && <p className="mt-1.5 text-sm text-muted-foreground">“{task.brief}”</p>}

        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <EmployeeAvatar ownerKey={ownerKey} size="sm" status="blocked" />
          <span className="font-medium text-foreground">{ownerName}</span>
          {stuckStep && (
            <>
              <span aria-hidden>·</span>
              <span>{t.common.steps[stuckStep.step_key] ?? stuckStep.step_key}</span>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        {/* Big plain-words blocked reason */}
        <div className="rounded-[var(--radius-card)] border border-blocked/35 bg-blocked-soft/65 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blocked">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>{t.inbox.blocked.reasonHeading}</span>
            {stuckStep && stuckStep.attempt > 1 && (
              <Badge variant="blocked" className="ml-auto">
                {fmt(t.inbox.blocked.attemptCount, { attempt: stuckStep.attempt })}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-base font-semibold leading-relaxed text-foreground sm:text-lg">
            {task.blocked_reason ?? stuckStep?.error ?? t.inbox.blocked.noReason}
          </p>
        </div>

        {/* Step timeline showing where it got stuck */}
        <div>
          <h3 className="mb-3.5 text-sm font-semibold text-muted-foreground">{t.inbox.blocked.allStepsHeading}</h3>
          <div className="rounded-[var(--radius-card)] border border-border bg-surface-muted/40 p-4 sm:p-5">
            <StepTimeline taskSteps={taskSteps} workflowKey={task.workflow_key} />
          </div>
        </div>
      </div>

      {/* Sticky Actions Bar */}
      <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] lg:bottom-0 z-10 flex flex-wrap items-center gap-2.5 border-t border-border bg-surface/95 px-4 py-3.5 backdrop-blur sm:px-6 sm:py-4">
        <CommandButton
          type="retry_step"
          payload={{
            task_id: task.id,
            ...(task.current_step_key ? { step_key: task.current_step_key } : {}),
          }}
          icon={RotateCcw}
          variant="primary"
          size="lg"
          onApplied={() => onApplied()}
        >
          {t.inbox.blocked.retryStep}
        </CommandButton>

        <Button
          variant="outline"
          size="lg"
          onClick={() => setCancelOpen(true)}
          className="text-blocked hover:bg-blocked-soft hover:text-blocked"
        >
          <X aria-hidden />
          {t.inbox.blocked.cancelTask}
        </Button>

        <Button variant="ghost" size="lg" asChild className="ml-auto">
          <Link to={`/tasks/${task.id}`}>
            {fmt(t.inbox.blocked.viewTaskDetail, { id: task.id })}
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </div>

      {/* Cancel Task Confirm Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fmt(t.inbox.blocked.cancelDialogTitle, { id: task.id })}</DialogTitle>
            <DialogDescription>{t.inbox.blocked.cancelDialogDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t.common.actions.cancel}</Button>
            </DialogClose>
            <CommandButton
              type="cancel_task"
              payload={{ task_id: task.id }}
              icon={X}
              variant="danger"
              onApplied={() => {
                setCancelOpen(false)
                onApplied()
              }}
            >
              {t.inbox.blocked.confirmCancel}
            </CommandButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Diamond,
  ExternalLink,
  FileText,
  HelpCircle,
  Maximize2,
  RotateCcw,
  SearchX,
  X,
} from 'lucide-react'
import type { EmployeeKey, Json, OwnerKey, Tables, TaskSource } from '@/lib/database.types'
import { demoPreviewUrl } from '@/lib/drive'
import { formatTime } from '@/lib/time'
import { useApprovals, useArtifacts, useLookups, useTask, useTaskEvents, useTaskSteps } from '@/hooks/queries'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import {
  CommandButton,
  EmployeeAvatar,
  EmptyState,
  ShopChip,
  StatusPill,
  StepTimeline,
  TimeAgo,
  WorkflowIcon,
} from '@/components'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

const VALID_OWNERS = new Set<OwnerKey>(['thu', 'mai', 'linh', 'ha', 'vy', 'an', 'bao', 'boss'])
const BARE_TASK_REF = /^#\d+$/

function toOwnerKey(actor: string): OwnerKey {
  return VALID_OWNERS.has(actor as OwnerKey) ? (actor as OwnerKey) : 'thu'
}

function asRecord(data: Json | null): Record<string, Json | undefined> | null {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, Json | undefined>
  }
  return null
}

export function TaskDetail({ taskId, showBackLink = true }: { taskId: number; showBackLink?: boolean }) {
  const { t } = useI18n()
  const taskQuery = useTask(taskId)
  const stepsQuery = useTaskSteps(taskId)
  const eventsQuery = useTaskEvents(taskId)
  const approvalsQuery = useApprovals()
  const artifactsQuery = useArtifacts()
  const { employee, ready } = useLookups()

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [previewArtifact, setPreviewArtifact] = useState<Tables<'artifacts'> | null>(null)

  const task = taskQuery.data
  const taskSteps = stepsQuery.data ?? []

  const openApproval = useMemo(
    () => (approvalsQuery.data ?? []).find((a) => a.task_id === taskId && a.status === 'open') ?? null,
    [approvalsQuery.data, taskId],
  )

  const taskArtifacts = useMemo(
    () => (artifactsQuery.data ?? []).filter((a) => a.task_id === taskId),
    [artifactsQuery.data, taskId],
  )

  const sortedEvents = useMemo(
    () => [...(eventsQuery.data ?? [])].sort((a, b) => b.at.localeCompare(a.at)),
    [eventsQuery.data],
  )

  const formatEventLine = (ev: Tables<'events'>): string => {
    const dataObj = asRecord(ev.data)
    const hasBareRefMessage = !ev.message || BARE_TASK_REF.test(ev.message.trim())

    // Per spec: if event.data is null show event.message (unless message is a bare "#142" ref from live simulator)
    if (dataObj === null && !hasBareRefMessage) {
      return ev.message
    }

    const tpl = t.taskDetail.history.eventTemplates
    const rawStepKey = typeof dataObj?.step_key === 'string' ? dataObj.step_key : null
    const stepLabel = rawStepKey ? (t.common.steps[rawStepKey] ?? rawStepKey) : ''

    const rawSource = typeof dataObj?.source === 'string' ? dataObj.source : null
    const sourceLabel =
      rawSource && rawSource in t.common.source ? t.common.source[rawSource as TaskSource] : (rawSource ?? '')

    const rawVia = typeof dataObj?.via === 'string' ? dataObj.via : null
    const viaLabel = rawVia && rawVia in t.common.source ? t.common.source[rawVia as TaskSource] : (rawVia ?? '')

    const rawTo = typeof dataObj?.to === 'string' ? dataObj.to : null
    const toName = rawTo
      ? rawTo === 'boss'
        ? t.common.you
        : (employee.get(rawTo as EmployeeKey)?.name ?? rawTo)
      : ''

    const note = typeof dataObj?.note === 'string' && dataObj.note.trim() ? dataObj.note.trim() : null
    const answer = typeof dataObj?.answer === 'string' && dataObj.answer.trim() ? dataObj.answer.trim() : null
    const reason = typeof dataObj?.reason === 'string' && dataObj.reason.trim() ? dataObj.reason.trim() : null

    switch (ev.type) {
      case 'task_created':
        return sourceLabel ? fmt(tpl.task_created, { source: sourceLabel }) : tpl.task_created_plain
      case 'step_started':
        return stepLabel ? fmt(tpl.step_started, { step: stepLabel }) : ev.message
      case 'step_done':
        return stepLabel ? fmt(tpl.step_done, { step: stepLabel }) : ev.message
      case 'approval_requested':
        return tpl.approval_requested
      case 'approved':
        return viaLabel ? fmt(tpl.approved, { via: viaLabel }) : tpl.approved_plain
      case 'rejected':
        return note ? fmt(tpl.rejected, { note }) : tpl.rejected_plain
      case 'changes_requested':
        return note ? fmt(tpl.changes_requested, { note }) : tpl.changes_requested_plain
      case 'answered':
        return answer ? fmt(tpl.answered, { answer }) : tpl.answered_plain
      case 'retry':
        return tpl.retry
      case 'task_cancelled':
        return tpl.task_cancelled
      case 'task_done':
        return tpl.task_done
      case 'blocked':
        return reason ? fmt(tpl.blocked, { reason }) : tpl.blocked_plain
      case 'question':
        return tpl.question
      case 'step_failed':
        return stepLabel ? fmt(tpl.step_failed, { step: stepLabel }) : tpl.step_failed_plain
      case 'reassigned':
        return toName ? fmt(tpl.reassigned, { to: toName }) : ev.message
      default:
        return ev.message
    }
  }

  if (taskQuery.isLoading || !ready) {
    return (
      <div aria-busy="true" className="space-y-5">
        {showBackLink && <Skeleton className="h-6 w-40" />}
        <Skeleton className="h-36 w-full" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="space-y-4">
        {showBackLink && (
          <Link
            to="/tasks"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t.taskDetail.backToTasks}
          </Link>
        )}
        <EmptyState
          icon={SearchX}
          title={t.taskDetail.notFound.title}
          description={t.taskDetail.notFound.description}
          action={
            <Button variant="primary" asChild>
              <Link to="/tasks">
                <ArrowLeft className="size-4" aria-hidden />
                {t.taskDetail.backToTasks}
              </Link>
            </Button>
          }
          className="bg-surface py-14"
        />
      </div>
    )
  }

  const wfMap = t.common.workflows as Record<string, { name: string; short: string } | undefined>
  const wfName = wfMap[task.workflow_key]?.name ?? task.workflow_key
  const canRetry = task.status === 'blocked' || task.status === 'failed'
  const canCancel = task.status === 'running' || task.status === 'queued' || task.status === 'waiting_boss'

  return (
    <div className="space-y-6">
      {showBackLink && (
        <div>
          <Link
            to="/tasks"
            className="inline-flex items-center gap-1.5 rounded-lg py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t.taskDetail.backToTasks}
          </Link>
        </div>
      )}

      {/* Header Card */}
      <Card>
        <div className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="tabular text-xl font-bold tracking-tight text-foreground sm:text-2xl">#{task.id}</span>
                <span aria-hidden className="text-muted-foreground">·</span>
                <h1 className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  <WorkflowIcon workflowKey={task.workflow_key} className="size-5 text-primary" />
                  <span>{wfName}</span>
                </h1>
                <span aria-hidden className="text-muted-foreground">·</span>
                <ShopChip shopId={task.shop_id} />
              </div>

              {/* Brief in quotes */}
              <p className="text-base leading-relaxed text-foreground">
                <span className="font-medium text-muted-foreground">{t.taskDetail.header.briefLabel}: </span>
                {task.brief ? (
                  <span className="font-medium text-foreground">“{task.brief}”</span>
                ) : (
                  <span className="italic text-muted-foreground">{t.taskDetail.header.noBrief}</span>
                )}
              </p>
            </div>

            {/* Status Pill + Actions */}
            <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
              <StatusPill kind="task" status={task.status} />

              {canRetry && (
                <CommandButton
                  type="retry_step"
                  payload={{
                    task_id: task.id,
                    ...(task.current_step_key ? { step_key: task.current_step_key } : {}),
                  }}
                  icon={RotateCcw}
                  variant="primary"
                >
                  {t.taskDetail.actions.retryStep}
                </CommandButton>
              )}

              {canCancel && (
                <Button
                  variant="outline"
                  onClick={() => setCancelDialogOpen(true)}
                  className="text-blocked hover:bg-blocked-soft hover:text-blocked"
                >
                  <X aria-hidden />
                  {t.taskDetail.actions.cancelTask}
                </Button>
              )}
            </div>
          </div>

          {/* Metadata strip */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3.5 text-sm text-muted-foreground">
            <span className="tabular">
              {fmt(t.taskDetail.header.startedAt, { time: formatTime(task.created_at) })} (
              <TimeAgo iso={task.created_at} />)
            </span>

            {task.finished_at && (
              <span className="tabular">
                {fmt(t.taskDetail.header.finishedAt, { time: formatTime(task.finished_at) })}
              </span>
            )}

            <span>
              {t.taskDetail.header.sourceLabel}:{' '}
              <strong className="font-medium text-foreground">{t.common.source[task.source]}</strong>
            </span>

            <span>
              {t.taskDetail.header.requireApprovalLabel}:{' '}
              <strong className="font-medium text-foreground">
                {task.require_approval ? t.taskDetail.header.yes : t.taskDetail.header.no}
              </strong>
            </span>
          </div>

          {/* Blocked / Failed reason callout if present */}
          {(task.status === 'blocked' || task.status === 'failed') && task.blocked_reason && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-blocked/35 bg-blocked-soft/65 p-3.5 sm:p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-blocked" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-blocked">
                  {task.status === 'blocked'
                    ? t.taskDetail.header.blockedBannerTitle
                    : t.taskDetail.header.failedBannerTitle}
                </p>
                <p className="mt-0.5 text-base font-medium text-foreground">{task.blocked_reason}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Two Columns on Desktop: STEPS & OUTPUT */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* Left Column: STEPS */}
        <Card>
          <CardHeader className="border-b border-border">
            <CardTitle>{t.taskDetail.steps.title}</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            {taskSteps.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.taskDetail.steps.empty}</p>
            ) : (
              <StepTimeline taskSteps={taskSteps} workflowKey={task.workflow_key} />
            )}
          </CardContent>
        </Card>

        {/* Right Column: OUTPUT */}
        <Card>
          <CardHeader className="border-b border-border">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{t.taskDetail.output.title}</CardTitle>
              {taskArtifacts.length > 0 && (
                <Badge variant="neutral" className="tabular">
                  {fmt(t.taskDetail.output.artifactsCount, { count: taskArtifacts.length })}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {/* Open approval callout linking to /inbox?item=approval-<id> */}
            {openApproval && (
              <div className="rounded-xl border border-waiting/40 bg-waiting-soft/60 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-waiting text-primary-foreground">
                    {openApproval.kind === 'question' ? (
                      <HelpCircle className="size-4" aria-hidden />
                    ) : (
                      <Diamond className="size-3.5" fill="currentColor" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-waiting">
                      {openApproval.kind === 'question'
                        ? t.taskDetail.output.openQuestionCalloutTitle
                        : t.taskDetail.output.openApprovalCalloutTitle}
                    </p>
                    <p className="mt-1 text-base font-semibold text-foreground">{openApproval.title}</p>
                    <div className="mt-3">
                      <Button variant="primary" size="sm" asChild>
                        <Link to={`/inbox?item=approval-${openApproval.id}`}>
                          {t.taskDetail.output.openInInbox}
                          <ArrowRight className="size-4" aria-hidden />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Artifacts list/grid */}
            {taskArtifacts.length === 0 ? (
              !openApproval && (
                <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                  <p className="font-medium text-foreground">{t.taskDetail.output.emptyTitle}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t.taskDetail.output.emptyDescription}</p>
                </div>
              )
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2">
                {taskArtifacts.map((art) => {
                  const isVisual = art.type === 'image' || art.type === 'video'
                  const dimLabel = art.width && art.height ? `${art.width}×${art.height}` : null
                  const durLabel = art.duration_sec
                    ? fmt(t.taskDetail.output.durationSec, { sec: art.duration_sec })
                    : null

                  return (
                    <div
                      key={art.id}
                      className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface-muted/35"
                    >
                      {isVisual ? (
                        <button
                          type="button"
                          onClick={() => setPreviewArtifact(art)}
                          aria-label={fmt(t.taskDetail.output.previewAria, { title: art.title })}
                          className="group relative aspect-[16/10] w-full overflow-hidden bg-surface-muted text-left"
                        >
                          <img
                            src={demoPreviewUrl(art)}
                            alt={art.title}
                            className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                          />
                          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-foreground/75 px-2 py-0.5 text-[11px] font-medium text-surface">
                            <Maximize2 className="size-3" aria-hidden />
                            {dimLabel ?? t.taskDetail.output.typeLabels[art.type]}
                          </span>
                        </button>
                      ) : (
                        <div className="flex aspect-[16/10] items-center justify-center bg-surface-muted text-muted-foreground">
                          <FileText className="size-10" aria-hidden />
                        </div>
                      )}

                      <div className="flex flex-1 flex-col justify-between gap-3 p-3.5">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="neutral">{t.taskDetail.output.typeLabels[art.type]}</Badge>
                            {durLabel && <span className="tabular text-xs text-muted-foreground">{durLabel}</span>}
                          </div>
                          <p className="mt-1.5 font-medium leading-snug text-foreground">{art.title}</p>
                        </div>

                        <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <EmployeeAvatar ownerKey={art.owner_key} size="sm" />
                            <span>{employee.get(art.owner_key)?.name ?? art.owner_key}</span>
                          </div>

                          <a
                            href={art.drive_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover hover:underline"
                          >
                            {t.common.actions.openInDrive}
                            <ExternalLink className="size-3.5" aria-hidden />
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section: HISTORY */}
      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>{t.taskDetail.history.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{t.taskDetail.history.subtitle}</p>
        </CardHeader>
        <CardContent className="pt-4">
          {sortedEvents.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t.taskDetail.history.empty}</p>
          ) : (
            <ol role="list" className="divide-y divide-border">
              {sortedEvents.map((ev) => {
                const ownerKey = toOwnerKey(ev.actor)
                const actorName =
                  ownerKey === 'boss' ? t.common.you : (employee.get(ownerKey)?.name ?? ev.actor)
                return (
                  <li key={ev.id} className="flex items-start gap-3 py-3 first:pt-1 last:pb-1">
                    <time
                      dateTime={ev.at}
                      className="tabular w-12 shrink-0 pt-1 text-xs font-medium text-muted-foreground"
                    >
                      {formatTime(ev.at)}
                    </time>
                    <EmployeeAvatar ownerKey={ownerKey} size="sm" className="mt-0.5" />
                    <div className="min-w-0 flex-1 text-base leading-relaxed">
                      <span className="font-semibold text-foreground">{actorName}</span>{' '}
                      <span className="text-foreground/90">{formatEventLine(ev)}</span>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Cancel Task Confirm Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fmt(t.taskDetail.actions.cancelDialogTitle, { id: task.id })}</DialogTitle>
            <DialogDescription>{t.taskDetail.actions.cancelDialogDescription}</DialogDescription>
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
              onApplied={() => setCancelDialogOpen(false)}
            >
              {t.taskDetail.actions.confirmCancel}
            </CommandButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox Dialog for Artifact Preview */}
      <Dialog
        open={Boolean(previewArtifact)}
        onOpenChange={(open) => {
          if (!open) setPreviewArtifact(null)
        }}
      >
        {previewArtifact && (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{previewArtifact.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2 pt-1">
                <ShopChip shopId={previewArtifact.shop_id} />
                {previewArtifact.width && previewArtifact.height && (
                  <span className="tabular text-xs text-muted-foreground">
                    {previewArtifact.width}×{previewArtifact.height}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-hidden rounded-xl border border-border bg-surface-muted">
              <img
                src={demoPreviewUrl(previewArtifact)}
                alt={previewArtifact.title}
                className="max-h-[65dvh] w-full object-contain"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewArtifact(null)}>
                {t.common.actions.close}
              </Button>
              <Button variant="primary" asChild>
                <a href={previewArtifact.drive_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden />
                  {t.common.actions.openInDrive}
                </a>
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

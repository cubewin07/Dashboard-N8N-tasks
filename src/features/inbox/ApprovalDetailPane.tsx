import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Diamond, HelpCircle, Maximize2, Pencil, RotateCcw, Send, Star, X } from 'lucide-react'
import type { EmployeeKey, Tables } from '@/lib/database.types'
import { parsePayload, type ReviewReplyItem } from '@/lib/payloads'
import { toneClasses } from '@/lib/status'
import { demoPreviewUrl } from '@/lib/drive'
import { useArtifacts, useLookups } from '@/hooks/queries'
import { useDrive } from '@/app/drive'
import { useI18n } from '@/i18n'
import { cn, fmt } from '@/lib/utils'
import { CommandButton, EmployeeAvatar, ShopChip, TimeAgo } from '@/components'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArtifactLightboxDialog } from './ArtifactLightboxDialog'

function StarRow({ stars }: { stars: number }) {
  const { t } = useI18n()
  const isVeryLow = stars <= 1
  const isLow = stars === 2
  const tone = isVeryLow ? toneClasses.blocked : isLow ? toneClasses.waiting : null

  return (
    <span
      role="img"
      aria-label={fmt(t.inbox.reviews.starsAria, { stars })}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        tone ? cn('border', tone.bg, tone.text, tone.border) : 'bg-waiting-soft/70 text-waiting',
      )}
    >
      <span aria-hidden className="inline-flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className={cn('size-3.5', i < stars ? 'fill-current' : 'opacity-25')}
          />
        ))}
      </span>
      <span className="tabular ml-0.5">{stars}★</span>
      {stars <= 2 && <span className="ml-1 text-[11px] font-medium">{t.inbox.reviews.lowStarBadge}</span>}
    </span>
  )
}

function ReviewReplyCard({
  item,
  editedText,
  onChangeDraft,
  onResetDraft,
}: {
  item: ReviewReplyItem
  editedText: string | undefined
  onChangeDraft: (text: string) => void
  onResetDraft: () => void
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const textareaId = useId()
  const currentDraft = editedText ?? item.draft
  const isEdited = editedText !== undefined && editedText.trim() !== item.draft.trim()
  const lowTone = item.stars === 1 ? toneClasses.blocked : item.stars === 2 ? toneClasses.waiting : null

  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border bg-surface p-4 sm:p-5',
        lowTone ? lowTone.border : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StarRow stars={item.stars} />
          <span className="text-sm font-semibold text-foreground">{item.customer}</span>
          <span aria-hidden className="text-muted-foreground">·</span>
          <span className="text-sm text-muted-foreground">{item.product}</span>
        </div>
        <span className="tabular text-xs text-muted-foreground">#{item.review_id}</span>
      </div>

      <p className="mt-3 text-base leading-relaxed text-foreground">“{item.text}”</p>

      <div className="mt-4 rounded-xl border border-border bg-surface-muted/65 p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-primary">{t.inbox.reviews.draftLabel}</span>
            {isEdited && <Badge variant="primary">{t.inbox.reviews.editedBadge}</Badge>}
          </div>
          <div className="flex items-center gap-1.5">
            {isEdited && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onResetDraft()
                  setEditing(false)
                }}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                {t.inbox.reviews.resetDraft}
              </Button>
            )}
            <Button
              variant={editing ? 'secondary' : 'outline'}
              size="sm"
              aria-expanded={editing}
              aria-label={
                editing
                  ? `${t.inbox.reviews.doneEditing} (${item.customer})`
                  : `${t.inbox.reviews.edit} (${item.customer})`
              }
              onClick={() => setEditing((v) => !v)}
            >
              <Pencil className="size-3.5" aria-hidden />
              {editing ? t.inbox.reviews.doneEditing : t.inbox.reviews.edit}
            </Button>
          </div>
        </div>

        {editing ? (
          <div className="mt-2.5">
            <Label htmlFor={textareaId} className="sr-only">
              {fmt(t.inbox.reviews.draftTextareaLabel, { customer: item.customer })}
            </Label>
            <Textarea
              id={textareaId}
              rows={4}
              value={currentDraft}
              onChange={(e) => onChangeDraft(e.target.value)}
              className="bg-surface text-base leading-relaxed"
            />
          </div>
        ) : (
          <p className="mt-2 text-base leading-relaxed text-foreground">{currentDraft}</p>
        )}
      </div>
    </div>
  )
}

export function ApprovalDetailPane({
  approval,
  task,
  onApplied,
}: {
  approval: Tables<'approvals'>
  task: Tables<'tasks'> | undefined
  onApplied: () => void
}) {
  const { t } = useI18n()
  const { employee } = useLookups()
  const artifactsData = useArtifacts().data
  const { connected: driveConnected, connect: connectDrive, state: driveState } = useDrive()

  const payload = useMemo(() => parsePayload(approval.payload), [approval.payload])
  const isQuestion = approval.kind === 'question' || payload.type === 'question'

  // Review draft edits keyed by review_id
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({})
  // Question answer state
  const [answer, setAnswer] = useState('')
  // Request changes inline note
  const [requestChangesOpen, setRequestChangesOpen] = useState(false)
  const [changeNote, setChangeNote] = useState('')
  // Reject confirmation dialog + optional note
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  // Lightbox artifact
  const [lightboxArtifact, setLightboxArtifact] = useState<Tables<'artifacts'> | null>(null)

  const changeNoteId = useId()
  const rejectNoteId = useId()
  const questionAnswerId = useId()

  // Compute non-identical edits for review_replies
  const cleanEdits = useMemo(() => {
    if (payload.type !== 'review_replies') return {}
    const out: Record<string, string> = {}
    for (const item of payload.items) {
      const candidate = draftEdits[item.review_id]
      if (candidate !== undefined && candidate.trim() !== '' && candidate.trim() !== item.draft.trim()) {
        out[item.review_id] = candidate.trim()
      }
    }
    return out
  }, [payload, draftEdits])

  const editedCount = Object.keys(cleanEdits).length

  // Provenance header info
  const provenanceNode = useMemo(() => {
    const getEmpName = (key: EmployeeKey) => employee.get(key)?.name ?? key
    if (payload.type === 'question') {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <EmployeeAvatar ownerKey={payload.asked_by} size="sm" />
          <span>{fmt(t.inbox.provenance.askedBy, { askedBy: getEmpName(payload.asked_by) })}</span>
        </div>
      )
    }
    const preparedBy = getEmpName(payload.prepared_by)
    const checkedBy = payload.checked_by ? getEmpName(payload.checked_by) : null
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <div className="inline-flex items-center gap-1.5">
          <EmployeeAvatar ownerKey={payload.prepared_by} size="sm" />
          {payload.checked_by && <EmployeeAvatar ownerKey={payload.checked_by} size="sm" className="-ml-2" />}
        </div>
        <span className="font-medium text-foreground/90">
          {checkedBy
            ? fmt(t.inbox.provenance.preparedAndChecked, { preparedBy, checkedBy })
            : fmt(t.inbox.provenance.preparedOnly, { preparedBy })}
        </span>
      </div>
    )
  }, [payload, employee, t.inbox.provenance])

  // Look up artifacts for `images` or `post`
  const imageArtifacts = useMemo(() => {
    const allArtifacts = artifactsData ?? []
    if (payload.type === 'images') {
      return payload.artifact_ids
        .map((id) => allArtifacts.find((a) => a.id === id))
        .filter((a): a is Tables<'artifacts'> => Boolean(a))
    }
    if (payload.type === 'post' && payload.artifact_id !== undefined) {
      const found = allArtifacts.find((a) => a.id === payload.artifact_id)
      return found ? [found] : []
    }
    return []
  }, [payload, artifactsData])

  return (
    <Card className="flex flex-col overflow-hidden">
      {/* Detail Header */}
      <div className="border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
              toneClasses.waiting.bg,
              toneClasses.waiting.text,
              toneClasses.waiting.border,
            )}
          >
            {isQuestion ? (
              <HelpCircle className="size-3.5" aria-hidden />
            ) : (
              <Diamond className="size-3" fill="currentColor" aria-hidden />
            )}
            {isQuestion ? t.inbox.kinds.question : t.inbox.kinds.approval}
          </span>

          {task && <ShopChip shopId={task.shop_id} />}

          <Link
            to={`/tasks/${approval.task_id}`}
            className="tabular inline-flex items-center rounded-md border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            #{approval.task_id}
          </Link>

          <TimeAgo iso={approval.created_at} className="ml-auto text-xs text-muted-foreground" />
        </div>

        <h2 className="mt-2.5 text-lg font-semibold leading-snug text-foreground sm:text-xl">{approval.title}</h2>

        <div className="mt-3">{provenanceNode}</div>
      </div>

      {/* Detail Body */}
      <div className="flex-1 space-y-5 p-4 sm:p-6">
        {/* 1. review_replies */}
        {payload.type === 'review_replies' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {fmt(t.inbox.reviews.countLabel, { count: payload.items.length })}
            </h3>
            <div className="space-y-4">
              {payload.items.map((item) => (
                <ReviewReplyCard
                  key={item.review_id}
                  item={item}
                  editedText={draftEdits[item.review_id]}
                  onChangeDraft={(txt) => setDraftEdits((prev) => ({ ...prev, [item.review_id]: txt }))}
                  onResetDraft={() =>
                    setDraftEdits((prev) => {
                      const next = { ...prev }
                      delete next[item.review_id]
                      return next
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* 2. images */}
        {payload.type === 'images' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {fmt(t.inbox.images.sectionLabel, { count: imageArtifacts.length })}
              </h3>
              {!driveConnected && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t.inbox.images.driveNotConnectedNote}</span>
                  <button
                    type="button"
                    disabled={driveState === 'connecting'}
                    onClick={() => void connectDrive()}
                    className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover disabled:opacity-50"
                  >
                    {t.inbox.images.connectDrive}
                  </button>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {imageArtifacts.map((art) => {
                const sizeStr = art.width && art.height ? `${art.width}×${art.height}` : null
                return (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => setLightboxArtifact(art)}
                    aria-label={fmt(t.inbox.images.openLightboxAria, { title: art.title })}
                    className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface text-left transition-colors hover:border-primary/50"
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-muted">
                      <img
                        src={demoPreviewUrl(art)}
                        alt={art.title}
                        className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-foreground/75 px-2 py-1 text-[11px] font-medium text-surface">
                        <Maximize2 className="size-3" aria-hidden />
                        {t.inbox.images.clickToZoom}
                      </span>
                    </div>
                    <div className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5">
                      <span className="truncate text-sm font-medium text-foreground">{art.title}</span>
                      {sizeStr && (
                        <Badge variant="neutral" className="tabular shrink-0">
                          {sizeStr}
                        </Badge>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 3. post */}
        {payload.type === 'post' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t.inbox.post.channelLabel}:</span>
              <Badge variant="primary">{t.inbox.post.channels[payload.channel]}</Badge>
            </div>

            <div className="rounded-[var(--radius-card)] border border-border bg-surface-muted/50 p-4 sm:p-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.inbox.post.contentLabel}
              </p>
              <p className="whitespace-pre-line text-base leading-relaxed text-foreground">{payload.text}</p>
            </div>

            {imageArtifacts[0] && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.inbox.post.imageLabel}
                  </span>
                  {!driveConnected && (
                    <span className="text-xs text-muted-foreground">{t.inbox.images.driveNotConnectedNote}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setLightboxArtifact(imageArtifacts[0])}
                  aria-label={fmt(t.inbox.images.openLightboxAria, { title: imageArtifacts[0].title })}
                  className="group relative block max-w-md overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-muted text-left hover:border-primary/50"
                >
                  <img
                    src={demoPreviewUrl(imageArtifacts[0])}
                    alt={imageArtifacts[0].title}
                    className="max-h-72 w-full object-cover"
                  />
                  <div className="flex items-center justify-between gap-2 bg-surface px-3.5 py-2 text-xs">
                    <span className="truncate font-medium text-foreground">{imageArtifacts[0].title}</span>
                    {imageArtifacts[0].width && imageArtifacts[0].height && (
                      <span className="tabular text-muted-foreground">
                        {imageArtifacts[0].width}×{imageArtifacts[0].height}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        {/* 4. generic */}
        {payload.type === 'generic' && (
          <div className="rounded-[var(--radius-card)] border border-border bg-surface-muted/50 p-4 sm:p-5">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.inbox.generic.summaryLabel}
            </h3>
            <p className="text-base leading-relaxed text-foreground">
              {payload.summary || task?.brief || t.inbox.generic.noSummary}
            </p>
          </div>
        )}

        {/* 5. question */}
        {payload.type === 'question' && (
          <div className="space-y-5">
            <div className="rounded-[var(--radius-card)] border border-waiting/30 bg-waiting-soft/50 p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-waiting">
                {t.inbox.question.questionLabel}
              </p>
              <p className="mt-1.5 text-base font-medium leading-relaxed text-foreground">{payload.question}</p>
            </div>

            {payload.options && payload.options.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{t.inbox.question.quickPickLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {payload.options.map((opt) => {
                    const selected = answer === opt
                    return (
                      <button
                        key={opt}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setAnswer(opt)}
                        className={cn(
                          'rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
                          selected
                            ? 'border-primary bg-primary-soft text-primary'
                            : 'border-border bg-surface text-foreground hover:bg-surface-muted',
                        )}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={questionAnswerId}>{t.inbox.question.answerLabel}</Label>
              <Textarea
                id={questionAnswerId}
                rows={3}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={t.inbox.question.answerPlaceholder}
                className="text-base leading-relaxed"
              />
            </div>
          </div>
        )}
      </div>

      {/* Sticky Actions Bar at the bottom of the detail pane */}
      <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] lg:bottom-0 z-10 border-t border-border bg-surface/95 px-4 py-3.5 backdrop-blur sm:px-6 sm:py-4">
        {isQuestion ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <CommandButton
              type="answer"
              payload={{ approval_id: approval.id, answer: answer.trim() }}
              disabled={!answer.trim()}
              icon={Send}
              variant="primary"
              size="lg"
              onApplied={() => onApplied()}
            >
              {t.inbox.question.sendAnswer}
            </CommandButton>
          </div>
        ) : (
          <div className="space-y-3">
            {requestChangesOpen && (
              <div className="rounded-xl border border-border bg-surface-muted/70 p-3.5 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={changeNoteId} className="font-semibold text-foreground">
                    {t.inbox.actions.requestChangesLabel}
                  </Label>
                  <Button variant="ghost" size="sm" onClick={() => setRequestChangesOpen(false)}>
                    {t.common.actions.cancel}
                  </Button>
                </div>
                <Textarea
                  id={changeNoteId}
                  rows={3}
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  placeholder={t.inbox.actions.requestChangesPlaceholder}
                  className="mt-2 bg-surface text-base leading-relaxed"
                />
                <div className="mt-3 flex justify-end">
                  <CommandButton
                    type="request_changes"
                    payload={{ approval_id: approval.id, note: changeNote.trim() }}
                    disabled={!changeNote.trim()}
                    icon={Pencil}
                    variant="primary"
                    onApplied={() => onApplied()}
                  >
                    {t.inbox.actions.sendRequestChanges}
                  </CommandButton>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <CommandButton
                type="approve"
                payload={{
                  approval_id: approval.id,
                  ...(editedCount > 0 ? { edits: cleanEdits } : {}),
                }}
                icon={Check}
                variant="primary"
                size="lg"
                onApplied={() => onApplied()}
              >
                {editedCount > 0
                  ? fmt(t.inbox.actions.approveEdited, { count: editedCount })
                  : t.inbox.actions.approve}
              </CommandButton>

              <Button
                variant={requestChangesOpen ? 'secondary' : 'outline'}
                size="lg"
                aria-expanded={requestChangesOpen}
                onClick={() => setRequestChangesOpen((v) => !v)}
              >
                <Pencil aria-hidden />
                {t.inbox.actions.requestChanges}
              </Button>

              <Button
                variant="ghost"
                size="lg"
                onClick={() => setRejectDialogOpen(true)}
                className="text-blocked hover:bg-blocked-soft hover:text-blocked"
              >
                <X aria-hidden />
                {t.inbox.actions.reject}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Confirm Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.inbox.actions.rejectDialogTitle}</DialogTitle>
            <DialogDescription>{t.inbox.actions.rejectDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={rejectNoteId}>{t.inbox.actions.rejectNoteLabel}</Label>
            <Textarea
              id={rejectNoteId}
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder={t.inbox.actions.rejectNotePlaceholder}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t.common.actions.cancel}</Button>
            </DialogClose>
            <CommandButton
              type="reject"
              payload={{
                approval_id: approval.id,
                ...(rejectNote.trim() ? { note: rejectNote.trim() } : {}),
              }}
              icon={X}
              variant="danger"
              onApplied={() => {
                setRejectDialogOpen(false)
                onApplied()
              }}
            >
              {t.inbox.actions.confirmReject}
            </CommandButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox Dialog */}
      <ArtifactLightboxDialog
        artifact={lightboxArtifact}
        open={Boolean(lightboxArtifact)}
        onOpenChange={(open) => {
          if (!open) setLightboxArtifact(null)
        }}
      />
    </Card>
  )
}

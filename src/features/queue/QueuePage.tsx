import {
  Check,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Inbox,
  MessageSquareWarning,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/app/auth'
import { CommandButton, PageHeader, TimeAgo } from '@/components'
import type { Command } from '@/domain/commands'
import { newId } from '@/domain/ids'
import { wallUlid } from '@/lib/ulid'
import type { QuestionId, ReviewId } from '@/domain/primitives'
import { bossQueue, pileFor, type BossQueueItem } from '@/domain/selectors'
import { IntakeBox } from '@/features/office/IntakeBox'
import { useI18n } from '@/i18n'
import { priorityTone, toneClasses } from '@/lib/status'
import { cn, fmt } from '@/lib/utils'
import { useConfig, useLabel, useOfficeSelector } from '@/office/hooks'
import { bootOffice } from '@/office/store'

const APPLIED_GRACE_MS = 1500

function BossQueueCard({ item }: { item: BossQueueItem }) {
  const { t } = useI18n()
  const label = useLabel()
  const { session } = useAuth()
  const { config } = useConfig()

  const [whyOpen, setWhyOpen] = useState(true)
  const [note, setNote] = useState('')
  const [answer, setAnswer] = useState('')

  const pTone = priorityTone[item.priority]
  const pCls = toneClasses[pTone]
  const taskTitle = item.task?.title ?? item.question?.text ?? item.id

  const makeDecideCommand = (
    decision: 'approved' | 'changes_requested' | 'rejected',
  ): Command<'review.decide'> => ({
    v: 1,
    id: newId('cmd', wallUlid),
    type: 'review.decide',
    issuedBy: {
      userId: session?.email ?? 'usr_boss',
      role: 'boss',
    },
    issuedAt: new Date().toISOString(),
    payload: {
      reviewId: item.id as ReviewId,
      decision,
      ...(note.trim().length > 0 ? { note: note.trim() } : {}),
    },
  })

  const makeAnswerCommand = (): Command<'question.answer'> => ({
    v: 1,
    id: newId('cmd', wallUlid),
    type: 'question.answer',
    issuedBy: {
      userId: session?.email ?? 'usr_boss',
      role: 'boss',
    },
    issuedAt: new Date().toISOString(),
    payload: {
      questionId: item.id as QuestionId,
      answer: answer.trim(),
    },
  })

  const activeDepts = useMemo(
    () => (config?.departments ?? []).filter((d) => d.active),
    [config],
  )

  return (
    <article
      data-queue-item={item.id}
      data-task-id={item.taskId}
      data-queue-kind={item.kind}
      className="space-y-3.5 rounded-[14px] border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                pCls.bg,
                pCls.text,
              )}
            >
              <span aria-hidden className={cn('size-1.5 rounded-full', pCls.dot)} />
              <span>{t.queue.priority[item.priority]}</span>
            </span>

            <span className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {t.queue.kindBadge[item.kind]}
            </span>

            {item.department && (
              <span className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-foreground">
                {label(item.department.label)}
              </span>
            )}
          </div>

          <h3 className="text-base font-semibold text-foreground">{taskTitle}</h3>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {item.requester && (
              <span>
                {fmt(t.queue.requesterLabel, { name: item.requester.name })}
              </span>
            )}
            {item.assignee && (
              <span>
                {fmt(t.queue.assigneeLabel, { name: item.assignee.name })}
              </span>
            )}
            <TimeAgo iso={item.createdAt} />
          </div>
        </div>
      </div>

      {item.kind === 'review' ? (
        <div className="space-y-3">
          {/* Why does this need the boss? */}
          <div className="rounded-xl border border-border bg-surface-muted/40 p-3">
            <button
              type="button"
              data-why-boss-toggle
              aria-expanded={whyOpen}
              onClick={() => setWhyOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-foreground"
            >
              <span className="inline-flex items-center gap-1.5">
                <ShieldAlert className="size-3.5 text-waiting" aria-hidden />
                <span>{t.queue.whyBossToggle}</span>
              </span>
              {whyOpen ? (
                <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
              )}
            </button>

            {whyOpen && (
              <ul
                data-why-boss-rules
                className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground"
              >
                {item.matchedRules.length > 0 ? (
                  item.matchedRules.map((rule) => (
                    <li
                      key={rule.id}
                      data-rule-id={rule.id}
                      className="text-foreground"
                    >
                      {label(rule.label)}
                    </li>
                  ))
                ) : (
                  <li>{t.queue.whyBossDefault}</li>
                )}
              </ul>
            )}
          </div>

          {/* Feedback note input */}
          <div className="space-y-1">
            <label htmlFor={`note-${item.id}`} className="sr-only">
              {t.queue.notePlaceholder}
            </label>
            <textarea
              id={`note-${item.id}`}
              data-review-note-input
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.queue.notePlaceholder}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none sm:text-sm"
            />
            {note.trim().length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                {t.queue.noteRequiredHint}
              </p>
            )}
          </div>

          {/* Decision CommandButtons */}
          <div className="flex flex-wrap items-center gap-2">
            <CommandButton
              size="sm"
              icon={Check}
              data-testid={`approve-${item.id}`}
              officeCommand={() => makeDecideCommand('approved')}
            >
              {t.queue.actions.approve}
            </CommandButton>

            <CommandButton
              size="sm"
              variant="outline"
              icon={RotateCcw}
              disabled={note.trim().length === 0}
              data-testid={`changes-${item.id}`}
              officeCommand={() => makeDecideCommand('changes_requested')}
            >
              {t.queue.actions.requestChanges}
            </CommandButton>

            <CommandButton
              size="sm"
              variant="outline"
              icon={X}
              data-testid={`reject-${item.id}`}
              officeCommand={() => makeDecideCommand('rejected')}
            >
              {t.queue.actions.reject}
            </CommandButton>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {item.question && (
            <div className="flex items-start gap-2 rounded-xl border border-waiting/30 bg-waiting-soft/50 p-3 text-sm text-foreground">
              <HelpCircle className="mt-0.5 size-4 shrink-0 text-waiting" aria-hidden />
              <span>{item.question.text}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {activeDepts.map((dept) => (
              <button
                key={dept.id}
                type="button"
                onClick={() =>
                  setAnswer(
                    fmt(t.queue.quickAssignPrefix, {
                      dept: label(dept.label),
                    }),
                  )
                }
                className="rounded-md border border-border bg-surface-muted px-2 py-1 text-xs font-medium text-foreground hover:bg-primary-soft hover:text-primary"
              >
                {fmt(t.queue.quickAssignPrefix, { dept: label(dept.label) })}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor={`answer-${item.id}`} className="sr-only">
              {t.queue.answerPlaceholder}
            </label>
            <input
              id={`answer-${item.id}`}
              data-question-answer-input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={t.queue.answerPlaceholder}
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none"
            />
            <CommandButton
              size="sm"
              icon={MessageSquareWarning}
              disabled={answer.trim().length === 0}
              data-testid={`answer-${item.id}`}
              officeCommand={makeAnswerCommand}
            >
              {t.queue.actions.answerQuestion}
            </CommandButton>
          </div>
        </div>
      )}
    </article>
  )
}

export function QueuePage() {
  const { t } = useI18n()
  const label = useLabel()
  const { config, status } = useConfig()
  const state = useOfficeSelector((s) => s)
  const [tab, setTab] = useState<'boss' | 'departments'>('boss')

  useEffect(() => {
    if (!config && status === 'loading') {
      void bootOffice()
    }
  }, [config, status])

  const liveBossItems = useMemo(
    () => (state ? bossQueue(state) : []),
    [state],
  )

  // Keep recently resolved items mounted briefly so the CommandButton 'applied' state is visible before leaving
  // Items that left the live queue are captured during render (no effect, so the
  // row never unmounts) and cleared by a timer once the grace period ends.
  const [lingerMap, setLingerMap] = useState<Record<string, BossQueueItem>>({})
  const [prevLiveItems, setPrevLiveItems] =
    useState<BossQueueItem[]>(liveBossItems)

  if (prevLiveItems !== liveBossItems) {
    setPrevLiveItems(liveBossItems)
    const currentIds = new Set(liveBossItems.map((i) => i.id))
    const removed = prevLiveItems.filter((i) => !currentIds.has(i.id))
    if (removed.length > 0) {
      const next = { ...lingerMap }
      for (const item of removed) {
        next[item.id] = item
      }
      setLingerMap(next)
    }
  }

  const hasLingering = Object.keys(lingerMap).length > 0
  useEffect(() => {
    if (!hasLingering) return
    const timer = setTimeout(() => setLingerMap({}), APPLIED_GRACE_MS)
    return () => clearTimeout(timer)
  }, [lingerMap, hasLingering])

  const displayedBossItems = useMemo(() => {
    const liveIds = new Set(liveBossItems.map((i) => i.id))
    const lingering = Object.values(lingerMap).filter(
      (i) => !liveIds.has(i.id),
    )
    return [...liveBossItems, ...lingering]
  }, [liveBossItems, lingerMap])

  const departmentApprovers = useMemo(() => {
    if (!state || !config) return []
    const roleMap = new Map(config.roles.map((r) => [r.key, r]))
    const deptMap = new Map(config.departments.map((d) => [d.id, d]))

    return config.employees
      .filter((emp) => {
        if (emp.state !== 'active') return false
        const r = roleMap.get(emp.roleKey)
        return r?.caps.approveLevel !== null && !r?.caps.humanOwner
      })
      .map((emp) => {
        const role = roleMap.get(emp.roleKey)!
        const dept = emp.departmentId ? (deptMap.get(emp.departmentId) ?? null) : null
        const pile = pileFor(state, emp.id)
        return {
          emp,
          role,
          dept,
          pileCount: pile.length,
          topItems: pile.slice(0, 5).map((rev) => ({
            review: rev,
            task: state.tasks[rev.taskId] ?? null,
          })),
        }
      })
  }, [state, config])

  return (
    <div data-queue-page className="space-y-5 pb-12">
      <PageHeader title={t.queue.title} description={t.queue.description} />

      {/* Mobile intake box at top of #/queue */}
      <div className="lg:hidden">
        <IntakeBox />
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label={t.queue.title}
        className="flex flex-wrap gap-2 border-b border-border pb-3"
      >
        <button
          type="button"
          role="tab"
          data-queue-tab="boss"
          aria-selected={tab === 'boss'}
          onClick={() => setTab('boss')}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
            tab === 'boss'
              ? 'bg-primary text-primary-foreground'
              : 'bg-surface-muted text-muted-foreground hover:text-foreground',
          )}
        >
          <span>{t.queue.tabs.boss}</span>
          <span
            data-boss-queue-count
            className={cn(
              'tabular rounded-full px-2 py-0.5 text-xs font-bold',
              tab === 'boss'
                ? 'bg-primary-foreground/20 text-primary-foreground'
                : 'bg-surface text-foreground',
            )}
          >
            {liveBossItems.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          data-queue-tab="departments"
          aria-selected={tab === 'departments'}
          onClick={() => setTab('departments')}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
            tab === 'departments'
              ? 'bg-primary text-primary-foreground'
              : 'bg-surface-muted text-muted-foreground hover:text-foreground',
          )}
        >
          <span>{t.queue.tabs.departments}</span>
        </button>
      </div>

      {tab === 'boss' ? (
        displayedBossItems.length === 0 ? (
          <div
            data-queue-empty
            className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-border bg-surface px-4 py-12 text-center"
          >
            <Inbox className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{t.queue.emptyBoss}</p>
          </div>
        ) : (
          <div data-boss-queue-list className="space-y-4">
            {displayedBossItems.map((item) => (
              <BossQueueCard key={item.id} item={item} />
            ))}
          </div>
        )
      ) : (
        <div data-dept-queue-list className="grid gap-4 md:grid-cols-2">
          {departmentApprovers.map(({ emp, role, dept, pileCount, topItems }) => (
            <section
              key={emp.id}
              data-approver-pile={emp.id}
              className="rounded-[14px] border border-border bg-surface p-4"
            >
              <header className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-foreground">
                      {emp.name}
                    </h3>
                    <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {label(role.label)}
                    </span>
                    {dept && (
                      <span className="text-xs text-muted-foreground">
                        · {label(dept.label)}
                      </span>
                    )}
                  </div>
                </div>
                <span className="tabular shrink-0 rounded-full bg-waiting-soft px-2.5 py-1 text-xs font-semibold text-waiting">
                  {fmt(t.queue.pileCount, { n: pileCount })}
                </span>
              </header>

              <div className="mt-3 space-y-2">
                {topItems.length === 0 ? (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    {t.queue.emptyDepartmentPile}
                  </p>
                ) : (
                  topItems.map(({ review, task }) => {
                    const pCls = toneClasses[priorityTone[review.priority]]
                    return (
                      <div
                        key={review.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted/30 px-3 py-2 text-xs"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden
                            className={cn('size-2 shrink-0 rounded-full', pCls.dot)}
                          />
                          <span className="truncate font-medium text-foreground">
                            {task?.title ?? review.taskId}
                          </span>
                        </div>
                        <TimeAgo
                          iso={review.createdAt}
                          className="shrink-0 text-muted-foreground"
                        />
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

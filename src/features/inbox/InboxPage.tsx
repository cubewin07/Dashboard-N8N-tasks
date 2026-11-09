import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, Diamond, HelpCircle, PartyPopper, X } from 'lucide-react'
import type { OwnerKey, Tables } from '@/lib/database.types'
import { parsePayload } from '@/lib/payloads'
import { toneClasses, type Tone } from '@/lib/status'
import { useAllTaskSteps, useApprovals, useLookups, useTasks } from '@/hooks/queries'
import { useI18n } from '@/i18n'
import { cn, fmt } from '@/lib/utils'
import { EmployeeAvatar, EmptyState, PageHeader, TimeAgo } from '@/components'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ApprovalDetailPane } from './ApprovalDetailPane'
import { BlockedTaskDetailPane } from './BlockedTaskDetailPane'

type FilterKind = 'all' | 'approval' | 'question' | 'blocked'

type InboxItem =
  | {
      key: string
      kind: 'approval' | 'question'
      sortAt: string
      title: string
      ownerKey: OwnerKey
      shopId: number | null
      taskId: number
      approval: Tables<'approvals'>
      task: Tables<'tasks'> | undefined
    }
  | {
      key: string
      kind: 'blocked'
      sortAt: string
      title: string
      ownerKey: OwnerKey
      shopId: number
      taskId: number
      blockedReason: string | null
      task: Tables<'tasks'>
      taskSteps: Tables<'task_steps'>[]
    }

function KindIconBadge({ kind }: { kind: 'approval' | 'question' | 'blocked' }) {
  const tone: Tone = kind === 'blocked' ? 'blocked' : 'waiting'
  const tc = toneClasses[tone]
  return (
    <span
      aria-hidden
      className={cn(
        'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg border text-xs font-bold',
        tc.bg,
        tc.text,
        tc.border,
      )}
    >
      {kind === 'approval' && <Diamond className="size-3" fill="currentColor" />}
      {kind === 'question' && <HelpCircle className="size-3.5" strokeWidth={2.5} />}
      {kind === 'blocked' && <X className="size-3.5" strokeWidth={3} />}
    </span>
  )
}

export function InboxPage() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<FilterKind>('all')
  const [recentlyApplied, setRecentlyApplied] = useState<{ key: string; title: string; taskId: number } | null>(null)

  const approvalsQuery = useApprovals()
  const tasksQuery = useTasks()
  const allStepsQuery = useAllTaskSteps()
  const { shop, employee, ready } = useLookups()

  const approvals = useMemo(() => approvalsQuery.data ?? [], [approvalsQuery.data])
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const allSteps = useMemo(() => allStepsQuery.data ?? [], [allStepsQuery.data])

  const isLoading = approvalsQuery.isLoading || tasksQuery.isLoading || !ready

  const taskById = useMemo(() => new Map(tasks.map((tk) => [tk.id, tk])), [tasks])

  const stepsByTaskId = useMemo(() => {
    const map = new Map<number, Tables<'task_steps'>[]>()
    for (const s of allSteps) {
      const list = map.get(s.task_id) ?? []
      list.push(s)
      map.set(s.task_id, list)
    }
    for (const [k, list] of map) {
      map.set(
        k,
        [...list].sort((a, b) => a.position - b.position),
      )
    }
    return map
  }, [allSteps])

  const wfMap = t.common.workflows as Record<string, { name: string; short: string } | undefined>

  // Build unified Inbox items list (open approvals + blocked tasks), newest first
  const allItems = useMemo<InboxItem[]>(() => {
    const openApprovalItems: InboxItem[] = approvals
      .filter((a) => a.status === 'open')
      .map((a) => {
        const parsed = parsePayload(a.payload)
        const ownerKey: OwnerKey = parsed.type === 'question' ? parsed.asked_by : parsed.prepared_by
        const parentTask = taskById.get(a.task_id)
        const itemKind: 'approval' | 'question' =
          a.kind === 'question' || parsed.type === 'question' ? 'question' : 'approval'
        return {
          key: `approval-${a.id}`,
          kind: itemKind,
          sortAt: a.created_at,
          title: a.title,
          ownerKey,
          shopId: parentTask?.shop_id ?? null,
          taskId: a.task_id,
          approval: a,
          task: parentTask,
        }
      })

    const blockedTaskItems: InboxItem[] = tasks
      .filter((tk) => tk.status === 'blocked')
      .map((tk) => {
        const tSteps = stepsByTaskId.get(tk.id) ?? []
        const stuckStep =
          tSteps.find((s) => s.step_key === tk.current_step_key) ??
          tSteps.find((s) => s.status === 'failed' || s.status === 'stuck') ??
          tSteps[0]
        const ownerKey: OwnerKey = stuckStep && stuckStep.owner_key !== 'boss' ? stuckStep.owner_key : 'bao'
        const wfName = wfMap[tk.workflow_key]?.name ?? tk.workflow_key
        return {
          key: `task-${tk.id}`,
          kind: 'blocked',
          sortAt: tk.updated_at,
          title: `${t.inbox.list.blockedPrefix}: ${wfName}`,
          ownerKey,
          shopId: tk.shop_id,
          taskId: tk.id,
          blockedReason: tk.blocked_reason,
          task: tk,
          taskSteps: tSteps,
        }
      })

    return [...openApprovalItems, ...blockedTaskItems].sort((a, b) => b.sortAt.localeCompare(a.sortAt))
  }, [approvals, tasks, taskById, stepsByTaskId, wfMap, t.inbox.list.blockedPrefix])

  const counts = useMemo(
    () => ({
      all: allItems.length,
      approval: allItems.filter((i) => i.kind === 'approval').length,
      question: allItems.filter((i) => i.kind === 'question').length,
      blocked: allItems.filter((i) => i.kind === 'blocked').length,
    }),
    [allItems],
  )

  const filteredItems = useMemo(
    () => (filter === 'all' ? allItems : allItems.filter((i) => i.kind === filter)),
    [allItems, filter],
  )

  const itemParam = searchParams.get('item')

  // Selected item resolution:
  // 1. If URL `?item=` matches an open item in `allItems`, use it.
  // 2. Otherwise on desktop, fall back to the first item in `filteredItems` (unless we are displaying `recentlyApplied`).
  const urlMatchedItem = useMemo(
    () => (itemParam ? allItems.find((i) => i.key === itemParam) ?? null : null),
    [allItems, itemParam],
  )

  const activeItem = urlMatchedItem ?? (recentlyApplied ? null : (filteredItems[0] ?? null))

  // Check if deep-linked `?item=approval-<id>` points to an approval that was already resolved
  const resolvedDeepLinkApproval = useMemo(() => {
    if (!itemParam || urlMatchedItem || !itemParam.startsWith('approval-')) return null
    const id = Number(itemParam.replace('approval-', ''))
    if (Number.isNaN(id)) return null
    const found = approvals.find((a) => a.id === id && a.status !== 'open')
    return found ?? null
  }, [itemParam, urlMatchedItem, approvals])

  const selectItem = (key: string) => {
    setRecentlyApplied(null)
    setSearchParams({ item: key })
  }

  const clearMobileSelection = () => {
    setRecentlyApplied(null)
    setSearchParams({})
  }

  // On mobile (< lg), show detail pane when `itemParam` is set or `recentlyApplied` is active
  const showMobileDetail = Boolean(itemParam || recentlyApplied)

  const filterChips: { key: FilterKind; label: string; count: number }[] = [
    { key: 'all', label: t.inbox.filters.all, count: counts.all },
    { key: 'approval', label: t.inbox.filters.approval, count: counts.approval },
    { key: 'question', label: t.inbox.filters.question, count: counts.question },
    { key: 'blocked', label: t.inbox.filters.blocked, count: counts.blocked },
  ]

  if (isLoading) {
    return (
      <section aria-busy="true">
        <PageHeader title={t.inbox.title} description={t.inbox.description} />
        <div className="mb-4 flex gap-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-2.5">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="hidden h-[460px] w-full lg:block" />
        </div>
      </section>
    )
  }

  // Full empty state when nothing at all needs the boss (and no recentlyApplied confirmation is showing)
  if (allItems.length === 0 && !recentlyApplied && !resolvedDeepLinkApproval) {
    return (
      <section>
        <PageHeader title={t.inbox.title} description={t.inbox.description} />
        <EmptyState
          icon={PartyPopper}
          title={t.inbox.empty.allClearTitle}
          description={t.inbox.empty.allClearDescription}
          className="bg-surface py-16"
        />
      </section>
    )
  }

  const appliedState =
    recentlyApplied ??
    (resolvedDeepLinkApproval
      ? {
          key: `approval-${resolvedDeepLinkApproval.id}`,
          title: resolvedDeepLinkApproval.title,
          taskId: resolvedDeepLinkApproval.task_id,
        }
      : null)

  return (
    <section>
      <PageHeader title={t.inbox.title} description={t.inbox.description} />

      {/* Filter Chips */}
      <div
        role="group"
        aria-label={t.inbox.filters.ariaLabel}
        className={cn('mb-5 flex flex-wrap items-center gap-2', showMobileDetail && 'hidden lg:flex')}
      >
        {filterChips.map((chip) => {
          const active = filter === chip.key
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setFilter(chip.key)
                setRecentlyApplied(null)
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-surface text-foreground hover:bg-surface-muted',
              )}
            >
              <span>{chip.label}</span>
              <span
                className={cn(
                  'tabular rounded-full px-1.5 py-0.2 text-xs font-semibold',
                  active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-surface-muted text-muted-foreground',
                )}
              >
                {chip.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Two-pane Master-Detail Layout */}
      <div className="grid items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Left Pane: Item List */}
        <div className={cn('space-y-2.5', showMobileDetail ? 'hidden lg:block' : 'block')}>
          {filteredItems.length === 0 ? (
            <EmptyState
              title={t.inbox.empty.filteredTitle}
              description={t.inbox.empty.filteredDescription}
              action={
                filter !== 'all' ? (
                  <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
                    {t.inbox.empty.showAll}
                  </Button>
                ) : undefined
              }
              className="bg-surface py-10"
            />
          ) : (
            <ul role="list" aria-label={t.inbox.list.ariaLabel} className="space-y-2.5">
              {filteredItems.map((item) => {
                const isSelected = activeItem?.key === item.key && !appliedState
                const ownerName =
                  item.ownerKey === 'boss' ? t.common.you : (employee.get(item.ownerKey)?.name ?? item.ownerKey)
                const shopName = item.shopId ? (shop.get(item.shopId)?.name ?? `#${item.shopId}`) : null

                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => selectItem(item.key)}
                      aria-current={isSelected ? 'true' : undefined}
                      className={cn(
                        'w-full rounded-[var(--radius-card)] border p-3.5 text-left transition-all sm:p-4',
                        isSelected
                          ? 'border-primary bg-primary-soft/45 ring-1 ring-primary/30 shadow-[var(--shadow-soft)]'
                          : 'border-border bg-surface hover:border-primary/40 hover:bg-surface-muted/40',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <KindIconBadge kind={item.kind} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[15px] font-semibold leading-snug text-foreground">{item.title}</p>
                          </div>

                          {item.kind === 'blocked' && item.blockedReason && (
                            <p className="mt-1.5 rounded-lg bg-blocked-soft/70 px-2.5 py-1.5 text-sm font-medium leading-snug text-blocked">
                              “{item.blockedReason}”
                            </p>
                          )}

                          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5 font-medium text-foreground/85">
                              <EmployeeAvatar ownerKey={item.ownerKey} size="sm" />
                              <span>{ownerName}</span>
                            </span>
                            {shopName && (
                              <>
                                <span aria-hidden>·</span>
                                <span className="truncate">{shopName}</span>
                              </>
                            )}
                            <span aria-hidden>·</span>
                            <TimeAgo iso={item.sortAt} />
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Right Pane: Detail View */}
        <div className={cn('min-w-0', showMobileDetail ? 'block' : 'hidden lg:block')}>
          {/* Mobile Back button */}
          <div className="mb-3 lg:hidden">
            <Button variant="ghost" size="sm" onClick={clearMobileSelection} className="-ml-2">
              <ArrowLeft className="size-4" aria-hidden />
              {t.inbox.list.backToList}
            </Button>
          </div>

          {appliedState ? (
            <Card className="animate-fade-in p-6 text-center sm:p-10">
              <div className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-done-soft text-done">
                <CheckCircle2 className="size-7" aria-hidden />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-foreground sm:text-xl">{t.inbox.applied.title}</h2>
              <p className="mt-1 text-sm font-medium text-foreground/80">{appliedState.title}</p>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{t.inbox.applied.description}</p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {filteredItems.length > 0 && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setRecentlyApplied(null)
                      setSearchParams({ item: filteredItems[0].key })
                    }}
                  >
                    {t.inbox.applied.nextItem}
                    <ArrowRight className="size-4" aria-hidden />
                  </Button>
                )}
                <Button variant="outline" asChild>
                  <Link to={`/tasks/${appliedState.taskId}`}>
                    {fmt(t.common.actions.goToTask, { id: appliedState.taskId })}
                  </Link>
                </Button>
              </div>
            </Card>
          ) : activeItem ? (
            activeItem.kind === 'blocked' ? (
              <BlockedTaskDetailPane
                key={activeItem.key}
                task={activeItem.task}
                taskSteps={activeItem.taskSteps}
                ownerKey={activeItem.ownerKey}
                onApplied={() =>
                  setRecentlyApplied({
                    key: activeItem.key,
                    title: activeItem.title,
                    taskId: activeItem.taskId,
                  })
                }
              />
            ) : (
              <ApprovalDetailPane
                key={activeItem.key}
                approval={activeItem.approval}
                task={activeItem.task}
                onApplied={() =>
                  setRecentlyApplied({
                    key: activeItem.key,
                    title: activeItem.title,
                    taskId: activeItem.taskId,
                  })
                }
              />
            )
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">{t.inbox.list.selectPrompt}</Card>
          )}
        </div>
      </div>
    </section>
  )
}

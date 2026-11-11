import {
  Activity,
  Briefcase,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState, type UIEvent } from 'react'
import { PageHeader, TimeAgo } from '@/components'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  activitySentenceParts,
  type ActivityCategory,
  type ActivitySentenceParts,
} from '@/domain/selectors'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useConfig, useLabel, useOfficeSelector } from '@/office/hooks'
import { bootOffice } from '@/office/store'
import { actorLabel, formatActivitySentence } from './formatActivity'

const ROW_HEIGHT = 68
const VIEWPORT_DEFAULT_HEIGHT = 640
const OVERSCAN = 5
const MAX_RENDERED_ROWS = 48

const CATEGORY_ORDER: readonly ('all' | ActivityCategory)[] = [
  'all',
  'work',
  'review',
  'help_question',
  'staff',
  'system',
]

function categoryIcon(category: ActivityCategory) {
  switch (category) {
    case 'work':
      return Briefcase
    case 'review':
      return CheckCircle2
    case 'help_question':
      return HelpCircle
    case 'staff':
      return Users
    case 'system':
      return Sparkles
  }
}

function categoryToneClass(category: ActivityCategory): string {
  switch (category) {
    case 'work':
      return 'bg-working-soft text-working'
    case 'review':
      return 'bg-done-soft text-done'
    case 'help_question':
      return 'bg-waiting-soft text-waiting'
    case 'staff':
      return 'bg-primary-soft text-primary'
    case 'system':
      return 'bg-surface-muted text-muted-foreground'
  }
}

export function ActivityPage() {
  const { t, lang } = useI18n()
  const label = useLabel()
  const { config, status } = useConfig()
  const state = useOfficeSelector((s) => s)

  const [floorFilter, setFloorFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | ActivityCategory>('all')
  const [scrollTop, setScrollTop] = useState(0)
  const [selectedItem, setSelectedItem] = useState<ActivitySentenceParts | null>(null)

  useEffect(() => {
    if (!config && status === 'loading') {
      void bootOffice()
    }
  }, [config, status])

  const items = useMemo(() => {
    if (!state) return []
    const reversed = [...state.log].reverse()
    const mapped = reversed.map((evt) => activitySentenceParts(evt, state))
    return mapped.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false
      }
      if (floorFilter !== 'all') {
        if (item.floorKey !== floorFilter && item.departmentId !== floorFilter) {
          return false
        }
      }
      return true
    })
  }, [state, categoryFilter, floorFilter])

  const totalCount = items.length
  const totalHeight = totalCount * ROW_HEIGHT
  const rawStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const visibleCount = Math.min(
    MAX_RENDERED_ROWS,
    Math.ceil(VIEWPORT_DEFAULT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2,
  )
  const startIndex = Math.min(rawStart, Math.max(0, totalCount - visibleCount))
  const endIndex = Math.min(totalCount, startIndex + visibleCount)
  const visibleItems = items.slice(startIndex, endIndex)
  const topPad = startIndex * ROW_HEIGHT
  const bottomPad = Math.max(0, (totalCount - endIndex) * ROW_HEIGHT)

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }

  const activeDepts = useMemo(
    () => (config?.departments ?? []).filter((d) => d.active),
    [config],
  )

  const selectedTask =
    selectedItem?.taskId && state ? state.tasks[selectedItem.taskId] ?? null : null
  const selectedDept =
    selectedItem?.departmentId && config
      ? config.departments.find((d) => d.id === selectedItem.departmentId) ?? null
      : null

  return (
    <div data-activity-page className="space-y-5 pb-12">
      <PageHeader title={t.activity.title} description={t.activity.description} />

      {/* Filter controls */}
      <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.activity.filters.categoryLabel}>
          {CATEGORY_ORDER.map((cat) => {
            const active = categoryFilter === cat
            return (
              <button
                key={cat}
                type="button"
                data-activity-category={cat}
                aria-pressed={active}
                onClick={() => {
                  setCategoryFilter(cat)
                  setScrollTop(0)
                }}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {t.activity.filters.categories[cat]}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="activity-floor-filter"
            className="shrink-0 text-xs font-medium text-muted-foreground"
          >
            {t.activity.filters.departmentLabel}
          </label>
          <select
            id="activity-floor-filter"
            data-activity-floor-select
            value={floorFilter}
            onChange={(e) => {
              setFloorFilter(e.target.value)
              setScrollTop(0)
            }}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground sm:w-48"
          >
            <option value="all">{t.activity.filters.allDepartments}</option>
            <option value="boss">{t.activity.filters.floorBoss}</option>
            <option value="management">{t.activity.filters.floorManagement}</option>
            {activeDepts.map((dept) => (
              <option key={dept.id} value={dept.key}>
                {label(dept.label)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Virtualised activity list */}
      {totalCount === 0 ? (
        <div
          data-activity-empty
          className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-border bg-surface px-4 py-12 text-center"
        >
          <Activity className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{t.activity.empty}</p>
        </div>
      ) : (
        <div
          data-activity-list
          onScroll={handleScroll}
          className="max-h-[640px] overflow-y-auto rounded-[14px] border border-border bg-surface"
        >
          <div
            style={{
              height: `${totalHeight}px`,
              paddingTop: `${topPad}px`,
              paddingBottom: `${bottomPad}px`,
            }}
            className="divide-y divide-border"
          >
            {visibleItems.map((item, idx) => {
              const Icon = categoryIcon(item.category)
              const sentence = formatActivitySentence(item, t, lang, state)
              return (
                <button
                  key={`${item.eventId}_${startIndex + idx}`}
                  type="button"
                  data-activity-row
                  data-event-type={item.type}
                  onClick={() => setSelectedItem(item)}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  className="flex w-full items-center justify-between gap-3 px-3.5 text-left transition-colors hover:bg-surface-muted/60 focus-visible:bg-surface-muted/60 focus-visible:outline-none"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-lg',
                        categoryToneClass(item.category),
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {sentence}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{actorLabel(item, t)}</span>
                        {item.shopName && (
                          <span className="rounded bg-surface-muted px-1.5 py-0.2 text-[11px] font-medium">
                            {item.shopName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <TimeAgo
                    iso={item.at}
                    className="shrink-0 text-xs text-muted-foreground"
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Detail Dialog / Popover when clicking an item */}
      <Dialog
        open={selectedItem !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null)
        }}
      >
        <DialogContent data-activity-detail className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.activity.detail.title}</DialogTitle>
            <DialogDescription>
              {selectedItem
                ? formatActivitySentence(selectedItem, t, lang, state)
                : ''}
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <dl className="grid grid-cols-3 gap-x-3 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">{t.activity.detail.actor}</dt>
              <dd className="col-span-2 font-medium text-foreground">
                {actorLabel(selectedItem, t)}
              </dd>

              {selectedItem.targetName && (
                <>
                  <dt className="text-muted-foreground">{t.activity.detail.target}</dt>
                  <dd className="col-span-2 font-medium text-foreground">
                    {selectedItem.targetName}
                  </dd>
                </>
              )}

              {selectedItem.taskTitle && (
                <>
                  <dt className="text-muted-foreground">{t.activity.detail.task}</dt>
                  <dd className="col-span-2 font-medium text-foreground">
                    {selectedItem.taskTitle}
                  </dd>
                </>
              )}

              {selectedTask && (
                <>
                  <dt className="text-muted-foreground">{t.activity.detail.status}</dt>
                  <dd className="col-span-2 font-medium text-foreground">
                    {t.activity.taskStatus[selectedTask.status]}
                  </dd>
                  <dt className="text-muted-foreground">{t.activity.detail.priority}</dt>
                  <dd className="col-span-2 font-medium text-foreground">
                    {t.queue.priority[selectedTask.priority]}
                  </dd>
                </>
              )}

              {selectedDept && (
                <>
                  <dt className="text-muted-foreground">{t.activity.detail.department}</dt>
                  <dd className="col-span-2 font-medium text-foreground">
                    {label(selectedDept.label)}
                  </dd>
                </>
              )}

              {selectedItem.reason && (
                <>
                  <dt className="text-muted-foreground">{t.activity.detail.note}</dt>
                  <dd className="col-span-2 text-foreground">{selectedItem.reason}</dd>
                </>
              )}
            </dl>
          )}

          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedItem(null)}
            >
              {t.activity.detail.close}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

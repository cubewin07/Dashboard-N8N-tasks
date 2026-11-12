import { ChevronDown, Crosshair, Search, X } from 'lucide-react'
import {
  memo,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { Input } from '@/components/ui/input'
import type { PersonActivity } from '@/domain/work'
import { useI18n } from '@/i18n'
import { activityTone, toneClasses } from '@/lib/status'
import { cn, fmt } from '@/lib/utils'
import { useLabel, useOfficeSelector } from '@/office/hooks'
import { usePeopleUi } from '@/office/uiStore'
import { keepFocusOnNextDrawerOpen } from './drawerFocus'
import {
  filterPeopleGroups,
  findPerson,
  type PeopleListPerson,
} from './peopleListModel'
import { usePeopleDirectory } from './usePeopleDirectory'

export interface PeopleListProps {
  /** `panel`: compact floating panel over the 3D view. `page`: full width (phone). */
  variant?: 'panel' | 'page'
  /** Panel only: start as just the header (the 3D view stays clear). */
  defaultCollapsed?: boolean
  className?: string
}

const ROW_SELECTOR = '[data-person-row]'
const FIELD_SEPARATOR = '\n'

interface PeopleListRowProps {
  person: PeopleListPerson
  tabbable: boolean
  compact: boolean
  onFocusRow: (id: string) => void
}

const PeopleListRow = memo(function PeopleListRow({
  person,
  tabbable,
  compact,
  onFocusRow,
}: PeopleListRowProps) {
  const { t } = useI18n()
  const label = useLabel()
  // One primitive per row: the row re-renders only when its own facts change,
  // not on every feed batch.
  const live = useOfficeSelector((s) => {
    const runtime = s?.people[person.id]
    const title = runtime?.taskId ? (s?.tasks[runtime.taskId]?.title ?? '') : ''
    return `${runtime?.activity ?? 'idle'}${FIELD_SEPARATOR}${title}`
  })
  const separatorAt = live.indexOf(FIELD_SEPARATOR)
  const activity = live.slice(0, separatorAt) as PersonActivity
  const taskTitle = live.slice(separatorAt + 1)

  const selected = usePeopleUi((s) => s.selectedId === person.id)
  const followed = usePeopleUi((s) => s.followedId === person.id)

  const tone = activityTone[activity]
  const tabIndex = tabbable ? 0 : -1

  return (
    <li
      data-employee-id={person.id}
      data-employee-activity={activity}
      data-followed={followed ? 'true' : undefined}
      className={cn(
        'flex items-stretch gap-1 rounded-lg border border-transparent transition-colors',
        selected && 'border-border bg-surface-muted',
        followed && 'border-primary/40 bg-primary-soft',
      )}
    >
      <button
        type="button"
        data-person-row={person.id}
        tabIndex={tabIndex}
        aria-current={selected ? 'true' : undefined}
        onFocus={() => onFocusRow(person.id)}
        onClick={() => usePeopleUi.getState().select(person.id)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
          compact ? 'min-h-11 py-1.5' : 'min-h-14 py-2',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-2.5 shrink-0 rounded-full',
            toneClasses[tone].dot,
            tone === 'working' && 'animate-pulse-dot',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">
              {person.name}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {label(person.roleLabel)}
            </span>
          </span>
          {taskTitle && <span className="sr-only">{`, ${t.org.activity[activity]}. `}</span>}
          <span
            data-person-task
            className={cn(
              'block truncate text-xs',
              taskTitle ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {taskTitle || t.org.activity[activity]}
          </span>
          {followed && <span className="sr-only">{`. ${t.office.people.followingBadge}`}</span>}
        </span>
      </button>
      <button
        type="button"
        data-follow-button={person.id}
        tabIndex={tabIndex}
        aria-pressed={followed}
        aria-label={fmt(t.office.people.follow, { name: person.name })}
        title={fmt(t.office.people.follow, { name: person.name })}
        onClick={() => {
          const ui = usePeopleUi.getState()
          ui.follow(ui.followedId === person.id ? null : person.id)
        }}
        className={cn(
          'grid shrink-0 place-items-center self-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
          compact ? 'size-9' : 'size-11',
          followed && 'bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground',
        )}
      >
        <Crosshair className="size-4" aria-hidden />
      </button>
    </li>
  )
})

/**
 * Searchable, keyboard-operable list of active people grouped like the org
 * list. Clicking a row selects the person (opens the drawer); the follow
 * button or Enter makes the camera follow them.
 */
export function PeopleList({
  variant = 'panel',
  defaultCollapsed = false,
  className,
}: PeopleListProps) {
  const { t } = useI18n()
  const label = useLabel()
  const directory = usePeopleDirectory()
  const followedId = usePeopleUi((s) => s.followedId)

  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Follow can also start or end in the 3D scene, so the announcement is
  // derived from the store, not from this component's own handlers.
  const [announced, setAnnounced] = useState<string | null>(followedId)
  const [followEnded, setFollowEnded] = useState(false)
  if (announced !== followedId) {
    setAnnounced(followedId)
    setFollowEnded(followedId === null)
  }

  const rootRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const baseId = useId()
  const bodyId = `${baseId}-body`
  const searchId = `${baseId}-search`
  const hintId = `${baseId}-hint`

  const groups = useMemo(
    () => (directory ? filterPeopleGroups(directory, query) : []),
    [directory, query],
  )
  const total = useMemo(
    () => groups.reduce((sum, g) => sum + g.people.length, 0),
    [groups],
  )

  const compact = variant === 'panel'
  const firstVisibleId = groups[0]?.people[0]?.id ?? null
  const tabbableId = findPerson(groups, activeId)?.id ?? firstVisibleId

  const followedName = directory ? findPerson(directory, followedId)?.name : null
  const announcement = followedName
    ? fmt(t.office.people.announceFollowing, { name: followedName })
    : followEnded
      ? t.office.people.announceFollowEnded
      : ''

  const rowElements = (): HTMLElement[] =>
    Array.from(rootRef.current?.querySelectorAll<HTMLElement>(ROW_SELECTOR) ?? [])

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target as HTMLElement
    const inSearch = target === searchRef.current
    const rowButton =
      target.closest('li')?.querySelector<HTMLElement>(ROW_SELECTOR) ?? null

    if (e.key === 'Escape') {
      // Esc first ends follow mode, then clears the search. With nothing to
      // clear it is left to the scene (back to the overview).
      const ui = usePeopleUi.getState()
      if (ui.followedId !== null) {
        ui.follow(null)
      } else if (query !== '') {
        setQuery('')
        searchRef.current?.focus()
      } else {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      return
    }

    if (inSearch) {
      if (e.key === 'ArrowDown') {
        const first = rowElements()[0]
        if (first) {
          e.preventDefault()
          first.focus()
        }
      }
      return
    }

    if (!rowButton) return

    const move = (to: HTMLElement | undefined) => {
      // The scene's floor shortcuts also listen for the arrow keys.
      e.preventDefault()
      e.stopPropagation()
      to?.focus()
    }

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        const rows = rowElements()
        const index = rows.indexOf(rowButton)
        if (e.key === 'ArrowUp' && index === 0) {
          move(searchRef.current ?? undefined)
        } else {
          move(rows[index + (e.key === 'ArrowDown' ? 1 : -1)])
        }
        break
      }
      case 'Home':
        move(rowElements()[0])
        break
      case 'End':
        move(rowElements().at(-1))
        break
      case 'Enter': {
        // On the follow button Enter keeps its native meaning (toggle).
        if (target !== rowButton) break
        const id = rowButton.dataset.personRow
        const person = findPerson(groups, id ?? null)
        if (!person) break
        e.preventDefault()
        e.stopPropagation()
        const ui = usePeopleUi.getState()
        ui.follow(person.id)
        if (ui.selectedId !== person.id) {
          keepFocusOnNextDrawerOpen()
          ui.select(person.id)
        }
        break
      }
      default:
    }
  }

  return (
    <section
      ref={rootRef}
      data-people-list={variant}
      aria-label={t.office.people.title}
      onKeyDown={onKeyDown}
      className={cn(
        'pointer-events-auto flex flex-col text-foreground',
        compact
          ? 'max-h-[min(34rem,calc(100dvh-19rem))] w-64 rounded-xl border border-border bg-surface/95 shadow-[var(--shadow-soft)] backdrop-blur'
          : 'w-full',
        className,
      )}
    >
      {compact && (
        <h2 className="shrink-0">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            aria-label={collapsed ? t.office.people.expand : t.office.people.collapse}
            onClick={() => setCollapsed((c) => !c)}
            className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <span aria-hidden>{t.office.people.title}</span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span aria-hidden className="tabular">
                {directory ? fmt(t.office.people.totalCount, { n: total }) : ''}
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  'size-4 transition-transform motion-reduce:transition-none',
                  collapsed && '-rotate-90',
                )}
              />
            </span>
          </button>
        </h2>
      )}

      <div
        id={bodyId}
        hidden={compact && collapsed}
        className={cn(
          'min-h-0 flex-1 flex-col',
          compact && collapsed ? 'hidden' : 'flex',
          compact ? 'gap-2 px-2 pb-2' : 'gap-3',
        )}
      >
        <div className="relative shrink-0">
          <label htmlFor={searchId} className="sr-only">
            {t.office.people.searchLabel}
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            id={searchId}
            type="search"
            name="people-search"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.office.people.searchPlaceholder}
            aria-describedby={hintId}
            className={cn(
              'px-9 [&::-webkit-search-cancel-button]:hidden',
              compact ? 'h-9' : 'h-11 text-base sm:text-sm',
            )}
          />
          {query !== '' && (
            <button
              type="button"
              aria-label={t.office.people.clearSearch}
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
              className={cn(
                'absolute right-0 top-0 grid place-items-center rounded-xl text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                compact ? 'size-9' : 'size-11',
              )}
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>

        <p
          id={hintId}
          className={cn(
            'shrink-0 text-[11px] text-muted-foreground',
            compact ? 'px-1' : 'hidden sm:block',
          )}
        >
          {t.office.people.keyboardHint}
        </p>

        <div
          data-people-scroll
          className={cn(
            'min-h-0 flex-1 space-y-3',
            compact && 'overflow-y-auto overscroll-contain pr-0.5',
          )}
        >
          {!directory ? (
            <p role="status" className="px-2 py-4 text-sm text-muted-foreground">
              {t.office.people.loading}
            </p>
          ) : total === 0 ? (
            <p role="status" className="px-2 py-4 text-sm text-muted-foreground">
              {query.trim()
                ? fmt(t.office.people.emptySearch, { query: query.trim() })
                : t.office.people.emptyList}
            </p>
          ) : (
            groups.map((group) => {
              const headingId = `${baseId}-g-${group.key}`
              return (
                <section
                  key={group.key}
                  data-people-group={group.key}
                  aria-labelledby={headingId}
                >
                  <h3
                    id={headingId}
                    aria-label={fmt(t.office.people.groupCount, {
                      label: label(group.label),
                      n: group.people.length,
                    })}
                    className="flex items-center justify-between gap-2 px-2 pb-1 text-xs font-semibold text-muted-foreground"
                  >
                    <span className="truncate">{label(group.label)}</span>
                    <span data-people-group-count className="tabular shrink-0">
                      {group.people.length}
                    </span>
                  </h3>
                  <ul className="space-y-0.5">
                    {group.people.map((person) => (
                      <PeopleListRow
                        key={person.id}
                        person={person}
                        compact={compact}
                        tabbable={person.id === tabbableId}
                        onFocusRow={setActiveId}
                      />
                    ))}
                  </ul>
                </section>
              )
            })
          )}
        </div>
      </div>

      <p data-follow-announcer aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  )
}

import { Search } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { fieldClasses, Input } from '@/components/ui/input'
import { useI18n } from '@/i18n'
import { cn, fmt } from '@/lib/utils'
import { useLabel } from '@/office/hooks'
import type { Department } from '@/domain/config'
import {
  filterWardrobePeople,
  nextIndex,
  type WardrobePeopleFilter,
  type WardrobePerson,
} from './peopleModel'

export interface PeoplePickerProps {
  people: readonly WardrobePerson[]
  departments: readonly Department[]
  selectedId: string | null
  /** Ids that already have a saved look (small marker). */
  savedIds?: ReadonlySet<string>
  onSelect: (id: string) => void
  className?: string
}

interface Group {
  key: string
  heading: string
  people: WardrobePerson[]
}

function initials(name: string): string {
  return Array.from(name.normalize('NFC').trim()).slice(0, 2).join('')
}

/** R1: every person who can be dressed. Search, department filter, archived toggle, arrow-key listbox. */
export function PeoplePicker({ people, departments, selectedId, savedIds, onSelect, className }: PeoplePickerProps) {
  const { t } = useI18n()
  const label = useLabel()
  const uid = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<WardrobePeopleFilter>({ query: '', departmentKey: null, showArchived: false })
  const [active, setActive] = useState(-1)

  const visible = useMemo(() => filterWardrobePeople(people, filter), [people, filter])

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = []
    const byKey = new Map<string, Group>()
    for (const p of visible) {
      const key = p.owner ? '__owners' : (p.departmentKey ?? '__none')
      let g = byKey.get(key)
      if (!g) {
        g = {
          key,
          heading: p.owner ? t.wardrobe.picker.ownersGroup : p.departmentLabel ? label(p.departmentLabel) : '',
          people: [],
        }
        byKey.set(key, g)
        out.push(g)
      }
      g.people.push(p)
    }
    return out
  }, [visible, label, t])

  const flat = useMemo(() => groups.flatMap((g) => g.people), [groups])
  const optionId = (id: string) => `${uid}-opt-${id}`
  const clampedActive = Math.min(active, flat.length - 1)
  const activePerson = clampedActive >= 0 ? flat[clampedActive] : undefined

  useEffect(() => {
    if (!activePerson) return
    document.getElementById(optionId(activePerson.id))?.scrollIntoView?.({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePerson?.id])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (activePerson) {
        e.preventDefault()
        onSelect(activePerson.id)
      }
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    let start = clampedActive
    if (start < 0) {
      const sel = flat.findIndex((p) => p.id === selectedId)
      start = e.key === 'ArrowDown' ? sel : sel >= 0 ? sel : -1
    }
    setActive(nextIndex(start, e.key, flat.length))
  }

  const departmentsInUse = departments.filter((d) => d.active)

  return (
    <section aria-label={t.wardrobe.picker.heading} className={cn('flex min-h-0 flex-col gap-3', className)} data-testid="wardrobe-picker">
      <div className="space-y-2">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            autoComplete="off"
            spellCheck={false}
            aria-label={t.wardrobe.picker.searchLabel}
            placeholder={t.wardrobe.picker.searchPlaceholder}
            value={filter.query}
            onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
            className="h-11 pl-9"
            data-testid="wardrobe-search"
          />
        </div>
        <select
          aria-label={t.wardrobe.picker.departmentLabel}
          value={filter.departmentKey ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, departmentKey: e.target.value || null }))}
          className={cn(fieldClasses, 'h-11')}
          data-testid="wardrobe-department"
        >
          <option value="">{t.wardrobe.picker.allDepartments}</option>
          {departmentsInUse.map((d) => (
            <option key={d.id} value={d.key}>
              {label(d.label)}
            </option>
          ))}
        </select>
        <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-5 accent-[var(--primary)]"
            checked={filter.showArchived}
            onChange={(e) => setFilter((f) => ({ ...f, showArchived: e.target.checked }))}
            data-testid="wardrobe-archived-toggle"
          />
          {t.wardrobe.picker.showArchived}
        </label>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {fmt(t.wardrobe.picker.count, { n: flat.length })}
      </p>

      <div
        ref={listRef}
        role="listbox"
        tabIndex={0}
        aria-label={t.wardrobe.picker.listLabel}
        aria-activedescendant={activePerson ? optionId(activePerson.id) : undefined}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (active < 0) {
            const sel = flat.findIndex((p) => p.id === selectedId)
            if (sel >= 0) setActive(sel)
          }
        }}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        data-testid="wardrobe-people"
      >
        {flat.length === 0 && <p className="px-2 py-4 text-sm text-muted-foreground">{t.wardrobe.picker.noResults}</p>}
        {groups.map((g) => (
          <div key={g.key} role="group" aria-label={g.heading || undefined} className="space-y-1">
            {g.heading && (
              <p aria-hidden className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.heading}
              </p>
            )}
            {g.people.map((p) => {
              const selected = p.id === selectedId
              const isActive = activePerson?.id === p.id
              return (
                <div
                  key={p.id}
                  id={optionId(p.id)}
                  role="option"
                  aria-selected={selected}
                  data-person-id={p.id}
                  onClick={() => {
                    setActive(flat.findIndex((x) => x.id === p.id))
                    onSelect(p.id)
                  }}
                  className={cn(
                    'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-sm',
                    selected ? 'bg-primary-soft text-foreground' : 'hover:bg-surface-muted',
                    isActive && 'outline-2 -outline-offset-2 outline-ring',
                    p.archived && 'opacity-70',
                  )}
                >
                  <span
                    aria-hidden
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold"
                  >
                    {initials(p.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {label(p.roleLabel)}
                      {p.archived ? ` · ${t.wardrobe.picker.archived}` : ''}
                    </span>
                  </span>
                  {savedIds?.has(p.id) && (
                    <span
                      role="img"
                      aria-label={t.wardrobe.picker.hasSavedLook}
                      title={t.wardrobe.picker.hasSavedLook}
                      className="size-2 shrink-0 rounded-full bg-primary"
                    />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

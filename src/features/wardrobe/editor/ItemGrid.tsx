import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Ban } from 'lucide-react'
import { fmt, cn } from '@/lib/utils'
import { useI18n } from '@/i18n'
import type { CatalogItem } from '@/scene/characters/catalog'
import { slotTags } from './editorModel'

export interface GridItemState {
  item: CatalogItem
  /** Hidden by another worn item (stays in the doc). */
  hiddenBy: CatalogItem | null
}

interface ItemGridProps {
  /** Accessible name of the group (the slot label). */
  label: string
  items: readonly CatalogItem[]
  /** Currently picked item id (null = none). */
  value: string | null
  /** Show a "none" option first. */
  allowNone: boolean
  /** Item that hides the slot right now, when any. */
  hiddenBy: CatalogItem | null
  onSelect: (id: string | null) => void
}

const OPTION_KEY_NONE = '__none__'

/**
 * Thumbnail grid as a radio group: one tab stop, arrow keys move and select (roving tabindex).
 * No windowing: the catalogue is a few dozen items per slot and thumbnails are lazy-loaded with
 * `content-visibility: auto` on each cell, so the cost stays far below the budget; revisit past ~200.
 */
export function ItemGrid({ label, items, value, allowNone, hiddenBy, onSelect }: ItemGridProps) {
  const { t, lang } = useI18n()
  const text = t.wardrobeEditor
  const groupId = useId()
  const tags = useMemo(() => slotTags(items), [items])
  const [tag, setTag] = useState<string | null>(null)
  const refs = useRef(new Map<string, HTMLButtonElement>())

  const visible = tag ? items.filter((it) => it.tags.includes(tag) || it.id === value) : items
  const keys = [...(allowNone ? [OPTION_KEY_NONE] : []), ...visible.map((it) => it.id)]
  const current = value ?? (allowNone ? OPTION_KEY_NONE : null)
  const tabStop = current && keys.includes(current) ? current : keys[0]

  function move(from: string, delta: number | 'start' | 'end'): void {
    const i = keys.indexOf(from)
    let next: number
    if (delta === 'start') next = 0
    else if (delta === 'end') next = keys.length - 1
    else next = (i + delta + keys.length) % keys.length
    const key = keys[next]!
    refs.current.get(key)?.focus()
    onSelect(key === OPTION_KEY_NONE ? null : key)
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, key: string): void {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        move(key, 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        move(key, -1)
        break
      case 'Home':
        e.preventDefault()
        move(key, 'start')
        break
      case 'End':
        e.preventDefault()
        move(key, 'end')
        break
      default:
    }
  }

  const tagLabel = (tg: string): string => (t.wardrobeEditor.tags as Record<string, string>)[tg] ?? tg

  function cell(key: string, name: string, checked: boolean, children: React.ReactNode, extra?: string) {
    return (
      <button
        key={key}
        ref={(el) => {
          if (el) refs.current.set(key, el)
          else refs.current.delete(key)
        }}
        type="button"
        role="radio"
        aria-checked={checked}
        aria-label={extra ? `${name}. ${extra}` : name}
        tabIndex={key === tabStop ? 0 : -1}
        onClick={() => onSelect(key === OPTION_KEY_NONE ? null : key)}
        onKeyDown={(e) => onKeyDown(e, key)}
        className={cn(
          'flex min-h-24 flex-col items-center justify-start gap-1 rounded-xl border border-border bg-surface p-2 text-center text-xs [content-visibility:auto] hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
          checked && 'border-primary bg-surface-muted ring-2 ring-primary',
          checked && hiddenBy && 'opacity-70',
        )}
      >
        {children}
      </button>
    )
  }

  return (
    <div className="space-y-2" data-testid={`grid-${groupId}`}>
      {tags.length > 1 ? (
        <div role="group" aria-label={text.grid.tagFilter} className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={tag === null}
            onClick={() => setTag(null)}
            className={cn(
              'min-h-8 rounded-full border border-border px-3 text-xs focus-visible:outline-2 focus-visible:outline-ring',
              tag === null ? 'bg-primary text-primary-foreground' : 'bg-surface hover:bg-surface-muted',
            )}
          >
            {text.grid.allTags}
          </button>
          {tags.map((tg) => (
            <button
              key={tg}
              type="button"
              aria-pressed={tag === tg}
              onClick={() => setTag(tag === tg ? null : tg)}
              className={cn(
                'min-h-8 rounded-full border border-border px-3 text-xs focus-visible:outline-2 focus-visible:outline-ring',
                tag === tg ? 'bg-primary text-primary-foreground' : 'bg-surface hover:bg-surface-muted',
              )}
            >
              {tagLabel(tg)}
            </button>
          ))}
        </div>
      ) : null}

      {hiddenBy ? (
        <p className="text-xs text-muted-foreground" data-testid="grid-hidden-note">
          {fmt(text.grid.hiddenBy, { item: hiddenBy.label[lang] })}
        </p>
      ) : null}

      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{text.grid.emptyTab}</p>
      ) : (
        <div
          role="radiogroup"
          aria-label={label}
          className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2"
        >
          {allowNone
            ? cell(
                OPTION_KEY_NONE,
                text.grid.none,
                value === null,
                <>
                  <span className="grid size-14 place-items-center rounded-lg bg-surface-muted text-muted-foreground">
                    <Ban className="size-6" aria-hidden />
                  </span>
                  <span>{text.grid.none}</span>
                </>,
              )
            : null}
          {visible.map((it) => {
            const checked = it.id === value
            const name = it.label[lang]
            return cell(
              it.id,
              name,
              checked,
              <>
                <img
                  src={`${import.meta.env.BASE_URL}assets/${it.thumb}`}
                  alt=""
                  loading="lazy"
                  width={56}
                  height={56}
                  className="size-14 rounded-lg bg-surface-muted object-contain"
                />
                <span className="line-clamp-2">{name}</span>
                {checked && hiddenBy ? (
                  <span className="rounded bg-surface-muted px-1 text-[10px] text-muted-foreground">
                    {text.grid.hiddenFlag}
                  </span>
                ) : null}
              </>,
              checked && hiddenBy ? fmt(text.grid.hiddenBy, { item: hiddenBy.label[lang] }) : undefined,
            )
          })}
        </div>
      )}
    </div>
  )
}

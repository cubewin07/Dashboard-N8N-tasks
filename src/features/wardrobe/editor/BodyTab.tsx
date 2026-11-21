import { useEffect, useId, useRef, useState } from 'react'
import { BODY_KEYS, type AppearanceV1, type BodyKey } from '@/domain/appearance'
import { fmt, cn } from '@/lib/utils'
import { useI18n } from '@/i18n'
import type { BaseBody, Catalog } from '@/scene/characters/catalog'
import { setBodySlider } from '../logic'
import { CharacterColor } from './ColorPickers'
import { limitingItemFor, sliderRange } from './editorModel'

/** Quiet period before a slider drag becomes one undo step. */
export const SLIDER_COMMIT_MS = 150

interface BodySliderProps {
  doc: AppearanceV1
  catalog: Catalog
  sliderKey: BodyKey
  onCommit: (next: AppearanceV1) => void
}

function BodySlider({ doc, catalog, sliderKey, onCommit }: BodySliderProps) {
  const { t, lang } = useI18n()
  const id = useId()
  const [min, max] = sliderRange(doc, sliderKey, catalog)
  const stored = doc.body[sliderKey]
  const [local, setLocal] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<number | null>(null)
  const latest = useRef({ doc, onCommit })
  useEffect(() => {
    latest.current = { doc, onCommit }
  })

  const flush = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const v = pending.current
    pending.current = null
    if (v === null) return
    const { doc: d, onCommit: commit } = latest.current
    commit(setBodySlider(d, sliderKey, v, catalog))
    setLocal(null)
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const shown = local ?? stored
  const limiter = limitingItemFor(doc, sliderKey, catalog)
  const narrowed = min > 0 || max < 1
  const name = t.wardrobeEditor.body.sliders[sliderKey]
  const noteId = `${id}-note`
  const pct = (v: number): string => `${Math.round(v * 100)}`

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <label htmlFor={id} className="font-medium">
          {name}
        </label>
        <output htmlFor={id} className="tabular-nums text-muted-foreground">
          {pct(shown)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={Math.min(Math.max(shown, min), max)}
        aria-describedby={narrowed ? noteId : undefined}
        onChange={(e) => {
          const v = Number(e.currentTarget.value)
          pending.current = v
          setLocal(v)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(flush, SLIDER_COMMIT_MS)
        }}
        onPointerUp={flush}
        onKeyUp={flush}
        onBlur={flush}
        className={cn('h-6 w-full accent-primary')}
      />
      {narrowed ? (
        <p id={noteId} className="text-xs text-muted-foreground">
          {limiter
            ? fmt(t.wardrobeEditor.body.limitedByRange, {
                item: limiter.label[lang],
                min: pct(min),
                max: pct(max),
              })
            : t.wardrobeEditor.body.limitedUnknown}
        </p>
      ) : null}
    </div>
  )
}

interface BodyTabProps {
  doc: AppearanceV1
  catalog: Catalog
  onEdit: (next: AppearanceV1) => void
  onBase: (base: BaseBody) => void
}

export function BodyTab({ doc, catalog, onEdit, onBase }: BodyTabProps) {
  const { t } = useI18n()
  const text = t.wardrobeEditor
  const bases: BaseBody[] = ['female', 'male']
  return (
    <div className="space-y-5">
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{text.body.base}</legend>
        <div role="radiogroup" aria-label={text.body.base} className="flex gap-2">
          {bases.map((b) => (
            <label
              key={b}
              className={cn(
                'flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
                doc.base === b ? 'border-primary bg-surface-muted ring-2 ring-primary' : 'bg-surface hover:bg-surface-muted',
              )}
            >
              <input
                type="radio"
                name="wardrobe-base"
                value={b}
                checked={doc.base === b}
                onChange={() => onBase(b)}
                className="sr-only"
              />
              {text.body[b]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-4">
        {BODY_KEYS.map((k) => (
          <BodySlider key={k} doc={doc} catalog={catalog} sliderKey={k} onCommit={onEdit} />
        ))}
      </div>
      <CharacterColor
        group="skin"
        label={text.colors.skin}
        catalog={catalog}
        value={doc.skin}
        onPick={(key) => onEdit({ ...doc, skin: key })}
      />
    </div>
  )
}

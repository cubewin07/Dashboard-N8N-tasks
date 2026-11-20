import { useRef, type KeyboardEvent } from 'react'
import { fmt, cn } from '@/lib/utils'
import { useI18n } from '@/i18n'
import type { AppearanceTintRegion, AppearanceV1 } from '@/domain/appearance'
import {
  getCatalogItem,
  getColorHex,
  type Catalog,
  type CatalogItem,
  type CatalogSlot,
  type ColorEntry,
  type ColorGroup,
} from '@/scene/characters/catalog'
import { getSlotItemId, hiddenSlots } from '../logic'

interface SwatchGroupProps {
  /** Accessible name of the whole group. */
  label: string
  catalog: Catalog
  entries: readonly ColorEntry[]
  value: string | undefined
  onPick: (key: string) => void
}

/** Swatches as a radio group (roving tabindex, arrow keys); every swatch is named from colors.json. */
export function SwatchGroup({ label, catalog, entries, value, onPick }: SwatchGroupProps) {
  const { lang } = useI18n()
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const keys = entries.map((e) => e.key)
  const tabStop = value && keys.includes(value) ? value : keys[0]

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, key: string): void {
    const i = keys.indexOf(key)
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % keys.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + keys.length) % keys.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = keys.length - 1
    if (next < 0) return
    e.preventDefault()
    const k = keys[next]!
    refs.current.get(k)?.focus()
    onPick(k)
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {entries.map((c) => {
        const checked = c.key === value
        return (
          <button
            key={c.key}
            ref={(el) => {
              if (el) refs.current.set(c.key, el)
              else refs.current.delete(c.key)
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={c.label[lang]}
            title={c.label[lang]}
            tabIndex={c.key === tabStop ? 0 : -1}
            onClick={() => onPick(c.key)}
            onKeyDown={(e) => onKeyDown(e, c.key)}
            style={{ backgroundColor: getColorHex(catalog, c.key) ?? undefined }}
            className={cn(
              'size-8 rounded-full border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              checked && 'ring-2 ring-primary ring-offset-2 ring-offset-surface',
            )}
          />
        )
      })}
    </div>
  )
}

/** A character colour (skin, hair or eyes): one swatch group. */
export function CharacterColor({
  group,
  label,
  catalog,
  value,
  onPick,
}: {
  group: Extract<ColorGroup, 'skin' | 'hair' | 'eyes'>
  label: string
  catalog: Catalog
  value: string
  onPick: (key: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-medium">{label}</h4>
      <SwatchGroup label={label} catalog={catalog} entries={catalog.colors[group]} value={value} onPick={onPick} />
    </div>
  )
}

/** Which swatch list a tint region uses: metal when its default is a metal colour, else fabric. */
export function regionGroup(item: CatalogItem, region: AppearanceTintRegion, catalog: Catalog): ColorGroup {
  const def = item.tint?.defaults[region]
  return def && catalog.colorKeys.metal.has(def) ? 'metal' : 'fabric'
}

/** Current colour of one tint region of a worn item (saved pick, else the item's default). */
export function regionValue(doc: AppearanceV1, item: CatalogItem, region: AppearanceTintRegion): string | undefined {
  return doc.colors[item.id]?.[region] ?? item.tint?.defaults[region]
}

interface ItemColorsProps {
  catalog: Catalog
  doc: AppearanceV1
  /** Slots whose worn items get colour pickers. */
  slots: readonly CatalogSlot[]
  onPick: (itemId: string, region: AppearanceTintRegion, key: string) => void
}

/** Colour pickers for each tint region of the worn, visible items in `slots`. */
export function ItemColors({ catalog, doc, slots, onPick }: ItemColorsProps) {
  const { t, lang } = useI18n()
  const hidden = hiddenSlots(doc, catalog)
  const rows = slots.flatMap((slot) => {
    if (hidden.has(slot)) return []
    const item = getCatalogItem(catalog, getSlotItemId(doc, slot))
    return item?.tint ? [item] : []
  })
  if (rows.length === 0) return null
  return (
    <div className="space-y-3">
      {rows.map((item) => (
        <div key={item.id} className="space-y-2">
          <h4 className="text-sm font-medium">{fmt(t.wardrobeEditor.colors.forItem, { item: item.label[lang] })}</h4>
          {item.tint!.regions.map((region) => {
            const group = regionGroup(item, region, catalog)
            const regionName = t.wardrobeEditor.colors.region[region]
            const name = `${item.label[lang]}: ${regionName}`
            return (
              <div key={region} className="space-y-1">
                {item.tint!.regions.length > 1 ? (
                  <p className="text-xs text-muted-foreground">{regionName}</p>
                ) : null}
                <SwatchGroup
                  label={name}
                  catalog={catalog}
                  entries={catalog.colors[group] ?? []}
                  value={regionValue(doc, item, region)}
                  onPick={(key) => onPick(item.id, region, key)}
                />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function setItemColor(
  doc: AppearanceV1,
  itemId: string,
  region: AppearanceTintRegion,
  key: string,
): AppearanceV1 {
  return { ...doc, colors: { ...doc.colors, [itemId]: { ...doc.colors[itemId], [region]: key } } }
}

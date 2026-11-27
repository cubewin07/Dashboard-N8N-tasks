/** Pure helpers behind the editor panel (no React): tab layout, base switch, limit explanations. */
import { BODY_KEYS, type AppearanceV1, type BodyKey } from '@/domain/appearance'
import { effectiveLimits } from '@/scene/characters/bodyMap'
import {
  DEFAULT_CATALOG,
  getCatalogItem,
  getSlotItems,
  type BaseBody,
  type Catalog,
  type CatalogItem,
  type CatalogSlot,
} from '@/scene/characters/catalog'
import { getSlotItemId, hiddenSlots, setSlotItemId, settleLook } from '../logic'

export type TabKey =
  | 'body'
  | 'face'
  | 'hair'
  | 'top'
  | 'bottom'
  | 'fullbody'
  | 'outer'
  | 'shoes'
  | 'accessories'

export interface TabSpec {
  key: TabKey
  /** Catalogue slots shown in this tab (a sub-tab each when more than one). */
  slots: CatalogSlot[]
}

/** Tab order and slot grouping; a slot file added to the catalogue joins the first tab that lists it. */
const TAB_LAYOUT: ReadonlyArray<{ key: TabKey; slots: readonly CatalogSlot[] }> = [
  { key: 'body', slots: [] },
  { key: 'face', slots: ['eyes', 'brows', 'mouth', 'facial_hair'] },
  { key: 'hair', slots: ['hair'] },
  { key: 'top', slots: ['top'] },
  { key: 'bottom', slots: ['bottom'] },
  { key: 'fullbody', slots: ['fullbody'] },
  { key: 'outer', slots: ['outer'] },
  { key: 'shoes', slots: ['shoes'] },
  { key: 'accessories', slots: ['head', 'glasses', 'ears', 'neck', 'wrist', 'bag'] },
]

/**
 * Tabs for a catalogue: the layout above, keeping only slots the catalogue has. A slot the layout
 * does not know yet is appended to "accessories" so it is never unreachable.
 */
export function buildTabs(catalog: Catalog = DEFAULT_CATALOG): TabSpec[] {
  const known = new Set<CatalogSlot>(TAB_LAYOUT.flatMap((t) => t.slots))
  const extra = (Object.keys(catalog.bySlot) as CatalogSlot[]).filter(
    (s) => !known.has(s) && catalog.bySlot[s].length > 0,
  )
  return TAB_LAYOUT.map((t) => ({
    key: t.key,
    slots: [...t.slots, ...(t.key === 'accessories' ? extra : [])].filter((s) => s in catalog.bySlot),
  }))
}

/** Tags offered as filter chips for a slot (sorted, without retired-only items). */
export function slotTags(items: readonly CatalogItem[]): string[] {
  const tags = new Set<string>()
  for (const it of items) if (!it.retired) for (const t of it.tags) tags.add(t)
  return [...tags].sort()
}

/** Items of a slot offered to the wearer: right base, not retired (unless currently worn). */
export function offeredItems(
  catalog: Catalog,
  slot: CatalogSlot,
  doc: AppearanceV1,
): CatalogItem[] {
  const worn = getSlotItemId(doc, slot)
  return getSlotItems(catalog, slot, doc.base).filter((it) => !it.retired || it.id === worn)
}

/** Optional slots can be emptied (`none` option); required ones cannot. */
const REQUIRED: ReadonlySet<CatalogSlot> = new Set(['eyes', 'brows', 'mouth', 'top', 'bottom', 'shoes'])
export function isOptionalSlot(slot: CatalogSlot): boolean {
  return !REQUIRED.has(slot)
}

/** The worn (not hidden) item that narrows `key` to `range`, when it can be told. */
export function limitingItemFor(
  doc: AppearanceV1,
  key: BodyKey,
  catalog: Catalog = DEFAULT_CATALOG,
): CatalogItem | null {
  const hidden = hiddenSlots(doc, catalog)
  const lim = effectiveLimits(doc, catalog)[key]
  if (!lim) return null
  let found: CatalogItem | null = null
  for (const slot of Object.keys(catalog.bySlot) as CatalogSlot[]) {
    if (hidden.has(slot)) continue
    const item = getCatalogItem(catalog, getSlotItemId(doc, slot))
    const r = item?.bodyLimits?.[key]
    if (!item || !r) continue
    if (r[0] === lim[0] || r[1] === lim[1]) found = item
    if (found) break
  }
  return found
}

/** Slider range `[min, max]` for a body key of the current draft (full 0..1 when nothing limits it). */
export function sliderRange(
  doc: AppearanceV1,
  key: BodyKey,
  catalog: Catalog = DEFAULT_CATALOG,
): [number, number] {
  const r = effectiveLimits(doc, catalog)[key]
  return r ? [r[0], r[1]] : [0, 1]
}

export { BODY_KEYS }

/**
 * Switch the base body. Items that do not support the new base are replaced by the slot's first
 * available item (required slots) or taken off (optional slots); then the look is settled and the
 * body clamped to the new limits by the caller.
 */
export function switchBase(
  doc: AppearanceV1,
  base: BaseBody,
  catalog: Catalog = DEFAULT_CATALOG,
): AppearanceV1 {
  if (doc.base === base) return doc
  let next: AppearanceV1 = { ...doc, base }
  for (const slot of Object.keys(catalog.bySlot) as CatalogSlot[]) {
    const id = getSlotItemId(next, slot)
    const item = getCatalogItem(catalog, id)
    if (!item || item.bases.includes(base)) continue
    const repl = isOptionalSlot(slot)
      ? null
      : (getSlotItems(catalog, slot, base).find((it) => !it.retired)?.id ?? null)
    next = setSlotItemId(next, slot, repl)
  }
  return settleLook(next, catalog)
}

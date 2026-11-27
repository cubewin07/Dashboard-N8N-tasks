/** What a look visibly wears, for the thumbnail fallback and the screen-reader description (R15). */
import type { AppearanceV1 } from '@/domain/appearance'
import { CATALOG_SLOTS, DEFAULT_CATALOG, getCatalogItem, type Catalog, type CatalogItem, type CatalogSlot } from '@/scene/characters/catalog'
import { getSlotItemId, hiddenSlots } from './logic'

/** Face slots are part of the head, not "worn items". */
const FACE_SLOTS: ReadonlySet<CatalogSlot> = new Set(['eyes', 'brows', 'mouth'])
/** Order the description reads in: body outward. */
const READ_ORDER: readonly CatalogSlot[] = [
  'hair',
  'facial_hair',
  'head',
  'glasses',
  'ears',
  'neck',
  'fullbody',
  'top',
  'outer',
  'bottom',
  'wrist',
  'bag',
  'shoes',
]

export interface WornEntry {
  slot: CatalogSlot
  item: CatalogItem
}

/** Visible worn items (hidden slots skipped), in reading order. */
export function visibleWorn(doc: AppearanceV1, catalog: Catalog = DEFAULT_CATALOG): WornEntry[] {
  const hidden = hiddenSlots(doc, catalog)
  const out: WornEntry[] = []
  const slots = [...READ_ORDER, ...CATALOG_SLOTS.filter((s) => !READ_ORDER.includes(s) && !FACE_SLOTS.has(s))]
  for (const slot of slots) {
    if (hidden.has(slot)) continue
    const item = getCatalogItem(catalog, getSlotItemId(doc, slot))
    if (item) out.push({ slot, item })
  }
  return out
}

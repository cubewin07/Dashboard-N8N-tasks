/**
 * Pure wardrobe rules (no React, no Date, no Math.random): putting items on and taking them
 * off, randomise, presets and look diffs. Everything is driven by catalogue data
 * (`hides`, `requires`, `conflicts`, `bodyLimits`, `tags`, `retired`), never by item ids.
 *
 * Design: items hidden by another worn item (a dress hides top and bottom) STAY in the doc,
 * so taking the dress off brings them back; if no pick was kept, the slot's default item
 * returns. Docs are never mutated; every function returns a new doc.
 */
import {
  BODY_KEYS,
  type AccessorySlot,
  type AppearanceV1,
  type BodyKey,
} from '@/domain/appearance'
import { makeRng } from '@/scene/director/rng'
import { effectiveLimits, type WardrobeLimitMeta } from '@/scene/characters/bodyMap'
import {
  DEFAULT_CATALOG,
  getCatalogItem,
  getSlotItems,
  hasBaseSupport,
  type Catalog,
  type CatalogItem,
  type CatalogSlot,
} from '@/scene/characters/catalog'
import { generateAppearance } from '@/scene/characters/generate'
import {
  DEFAULT_GENERATOR_WEIGHTS,
  itemWeight,
  type GeneratorWeights,
} from '@/scene/characters/generatorWeights'
import type { Preset } from './presets'

type LimitMetas =
  | ReadonlyMap<string, WardrobeLimitMeta>
  | Readonly<Record<string, WardrobeLimitMeta | undefined>>

/** What the randomiser can lock: any slot, the skin tone, or all body sliders. */
export type LockKey = CatalogSlot | 'skin' | 'body'

/** Slots that can never be empty (unless a worn item hides them). */
const REQUIRED_SLOTS: ReadonlySet<CatalogSlot> = new Set([
  'eyes',
  'brows',
  'mouth',
  'top',
  'bottom',
  'shoes',
])

export type RefusalReason =
  | 'unknown_item'
  | 'unsupported_base'
  | 'retired'
  | 'requires'
  | 'required'

export type RemovalReason = 'hides' | 'conflict' | 'requires'

export interface BodyClamp {
  slider: BodyKey
  from: number
  to: number
  /** The worn item that narrows the slider (null when it cannot be told). */
  item: string | null
}

export interface ApplyResult {
  doc: AppearanceV1
  changed: boolean
  refused?: RefusalReason
  /** Other worn items taken off to make room (a dress when a top is picked, a conflicting item, an orphaned outer). */
  removed: Array<{ slot: CatalogSlot; itemId: string; reason: RemovalReason }>
  /** Items put back or added automatically (the hidden top after the dress comes off, a top under an outer). */
  restored: Array<{ slot: CatalogSlot; itemId: string }>
  /**
   * Sliders now outside `effectiveLimits`. The doc is returned UNCLAMPED so the UI can ask
   * "clamp body or cancel": confirm with `applyClamps(result.doc, result.clamps)`, cancel by
   * keeping the previous doc.
   */
  clamps: BodyClamp[]
}

// ---------------------------------------------------------------------------
// Doc slot access
// ---------------------------------------------------------------------------

export function getSlotItemId(doc: AppearanceV1, slot: CatalogSlot): string | null {
  switch (slot) {
    case 'hair':
      return doc.hair.item
    case 'eyes':
      return doc.face.eyes
    case 'brows':
      return doc.face.brows
    case 'mouth':
      return doc.face.mouth
    case 'facial_hair':
      return doc.face.facialHair
    case 'top':
    case 'bottom':
    case 'fullbody':
    case 'outer':
    case 'shoes':
      return doc.outfit[slot]
    default:
      return doc.accessories[slot] ?? null
  }
}

export function setSlotItemId(
  doc: AppearanceV1,
  slot: CatalogSlot,
  id: string | null,
): AppearanceV1 {
  switch (slot) {
    case 'hair':
      return { ...doc, hair: { ...doc.hair, item: id } }
    case 'eyes':
    case 'brows':
    case 'mouth':
      return id === null ? doc : { ...doc, face: { ...doc.face, [slot]: id } }
    case 'facial_hair':
      return { ...doc, face: { ...doc.face, facialHair: id } }
    case 'top':
    case 'bottom':
    case 'fullbody':
    case 'outer':
    case 'shoes':
      return { ...doc, outfit: { ...doc.outfit, [slot]: id } }
    default: {
      const accessories = { ...doc.accessories }
      if (id === null) delete accessories[slot as AccessorySlot]
      else accessories[slot as AccessorySlot] = id
      return { ...doc, accessories }
    }
  }
}

interface Worn {
  slot: CatalogSlot
  item: CatalogItem
}

function wornItems(doc: AppearanceV1, catalog: Catalog): Worn[] {
  const out: Worn[] = []
  for (const slot of catalogSlotsInOrder(catalog)) {
    const id = getSlotItemId(doc, slot)
    const item = id ? getCatalogItem(catalog, id) : undefined
    if (item) out.push({ slot, item })
  }
  return out
}

function catalogSlotsInOrder(catalog: Catalog): CatalogSlot[] {
  return Object.keys(catalog.bySlot) as CatalogSlot[]
}

/** Slots hidden by what is worn (the picks inside them stay in the doc). */
export function hiddenSlots(doc: AppearanceV1, catalog: Catalog = DEFAULT_CATALOG): Set<CatalogSlot> {
  const hidden = new Set<CatalogSlot>()
  for (const w of wornItems(doc, catalog)) for (const h of w.item.hides) hidden.add(h)
  return hidden
}

/** True when `slot` holds a visible (not hidden) item. */
function isPresent(doc: AppearanceV1, slot: CatalogSlot, hidden: ReadonlySet<CatalogSlot>): boolean {
  return !hidden.has(slot) && getSlotItemId(doc, slot) !== null
}

function defaultItemFor(
  doc: AppearanceV1,
  slot: CatalogSlot,
  catalog: Catalog,
): CatalogItem | undefined {
  const worn = wornItems(doc, catalog)
  return getSlotItems(catalog, slot, doc.base).find(
    (it) =>
      !it.retired &&
      !worn.some((w) => it.conflicts?.includes(w.item.id) || w.item.conflicts?.includes(it.id)),
  )
}

// ---------------------------------------------------------------------------
// Settling: hidden picks come back, orphaned layers go
// ---------------------------------------------------------------------------

interface Trace {
  removed: ApplyResult['removed']
  restored: ApplyResult['restored']
}

/**
 * Bring a doc back to a consistent state: required slots that are no longer hidden get their
 * default item, and items whose `requires` is unmet are removed (`keep` slots are only
 * removed as a last resort of an unmet requirement; they are never swapped).
 */
export function settleLook(
  input: AppearanceV1,
  catalog: Catalog = DEFAULT_CATALOG,
  trace: Trace = { removed: [], restored: [] },
): AppearanceV1 {
  let doc = input
  for (let pass = 0; pass < 6; pass += 1) {
    let dirty = false
    const hidden = hiddenSlots(doc, catalog)
    for (const slot of REQUIRED_SLOTS) {
      if (hidden.has(slot) || getSlotItemId(doc, slot) !== null) continue
      const def = defaultItemFor(doc, slot, catalog)
      if (!def) continue
      doc = setSlotItemId(doc, slot, def.id)
      trace.restored.push({ slot, itemId: def.id })
      dirty = true
    }
    const hiddenNow = hiddenSlots(doc, catalog)
    for (const w of wornItems(doc, catalog)) {
      const req = w.item.requires
      if (!req || req.length === 0 || hiddenNow.has(w.slot)) continue
      if (req.some((s) => isPresent(doc, s, hiddenNow))) continue
      doc = setSlotItemId(doc, w.slot, null)
      trace.removed.push({ slot: w.slot, itemId: w.item.id, reason: 'requires' })
      dirty = true
      break
    }
    if (!dirty) break
  }
  return doc
}

// ---------------------------------------------------------------------------
// Body limits
// ---------------------------------------------------------------------------

function roundTo(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Sliders outside `effectiveLimits(doc)`; empty when the body fits what is worn. */
export function bodyClamps(
  doc: AppearanceV1,
  catalog: Catalog = DEFAULT_CATALOG,
  metas?: LimitMetas,
  prefer?: string | null,
): BodyClamp[] {
  const limits = effectiveLimits(doc, catalog, metas)
  const out: BodyClamp[] = []
  for (const key of BODY_KEYS) {
    const range = limits[key]
    if (!range) continue
    const from = doc.body[key]
    const to = roundTo(Math.min(Math.max(from, range[0]), range[1]))
    if (to === from) continue
    out.push({ slider: key, from, to, item: limitingItem(doc, key, from, catalog, metas, prefer) })
  }
  return out
}

function limitingItem(
  doc: AppearanceV1,
  key: BodyKey,
  value: number,
  catalog: Catalog,
  metas: LimitMetas | undefined,
  prefer?: string | null,
): string | null {
  const hidden = hiddenSlots(doc, catalog)
  const excludes = (w: Worn): boolean => {
    const ranges = [
      w.item.bodyLimits?.[key],
      metas instanceof Map
        ? metas.get(w.item.id)?.bodyLimits?.[key]
        : (metas as Record<string, WardrobeLimitMeta | undefined> | undefined)?.[w.item.id]
            ?.bodyLimits?.[key],
    ]
    return ranges.some((r) => r && (value < r[0] || value > r[1]))
  }
  const candidates = wornItems(doc, catalog).filter((w) => !hidden.has(w.slot) && excludes(w))
  const preferred = candidates.find((w) => w.item.id === prefer)
  return (preferred ?? candidates[0])?.item.id ?? null
}

/** Confirm a "clamp body" decision. */
export function applyClamps(doc: AppearanceV1, clamps: readonly BodyClamp[]): AppearanceV1 {
  if (clamps.length === 0) return doc
  const body = { ...doc.body }
  for (const c of clamps) body[c.slider] = c.to
  return { ...doc, body }
}

/** Set one body slider, never outside `effectiveLimits` of what is worn. */
export function setBodySlider(
  doc: AppearanceV1,
  slider: BodyKey,
  value: number,
  catalog: Catalog = DEFAULT_CATALOG,
  metas?: LimitMetas,
): AppearanceV1 {
  const unit = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1)
  const range = effectiveLimits(doc, catalog, metas)[slider]
  const next = range ? Math.min(Math.max(unit, range[0]), range[1]) : unit
  if (doc.body[slider] === next) return doc
  return { ...doc, body: { ...doc.body, [slider]: roundTo(next) } }
}

// ---------------------------------------------------------------------------
// applyItem
// ---------------------------------------------------------------------------

interface RawResult extends Trace {
  doc: AppearanceV1
  refused?: RefusalReason
}

function applyItemRaw(
  draft: AppearanceV1,
  slot: CatalogSlot,
  itemId: string | null,
  catalog: Catalog,
): RawResult {
  const trace: Trace = { removed: [], restored: [] }
  const current = getSlotItemId(draft, slot)
  if (current === itemId) return { doc: draft, ...trace }

  if (itemId === null) {
    const hidden = hiddenSlots(draft, catalog)
    if (REQUIRED_SLOTS.has(slot) && !hidden.has(slot)) {
      return { doc: draft, refused: 'required', ...trace }
    }
    const doc = settleLook(setSlotItemId(draft, slot, null), catalog, trace)
    return { doc, ...trace }
  }

  const item = getCatalogItem(catalog, itemId)
  if (!item || item.slot !== slot) return { doc: draft, refused: 'unknown_item', ...trace }
  if (!hasBaseSupport(item, draft.base)) return { doc: draft, refused: 'unsupported_base', ...trace }
  if (item.retired) return { doc: draft, refused: 'retired', ...trace }

  let doc = setSlotItemId(draft, slot, itemId)

  // Last action wins: whatever hides this slot (a dress over a top) comes off.
  for (const w of wornItems(doc, catalog)) {
    if (w.slot !== slot && w.item.hides.includes(slot)) {
      doc = setSlotItemId(doc, w.slot, null)
      trace.removed.push({ slot: w.slot, itemId: w.item.id, reason: 'hides' })
    }
  }

  // Conflicting items (declared on either side) come off.
  for (const w of wornItems(doc, catalog)) {
    if (w.slot === slot) continue
    if (item.conflicts?.includes(w.item.id) || w.item.conflicts?.includes(item.id)) {
      doc = setSlotItemId(doc, w.slot, null)
      trace.removed.push({ slot: w.slot, itemId: w.item.id, reason: 'conflict' })
    }
  }

  // Needs something underneath: add the default item of the first slot that has one.
  if (item.requires && item.requires.length > 0) {
    const hidden = hiddenSlots(doc, catalog)
    if (!item.requires.some((s) => isPresent(doc, s, hidden))) {
      let added = false
      for (const reqSlot of item.requires) {
        const def = defaultItemFor(doc, reqSlot, catalog)
        if (!def) continue
        doc = setSlotItemId(doc, reqSlot, def.id)
        trace.restored.push({ slot: reqSlot, itemId: def.id })
        added = true
        break
      }
      if (!added) return { doc: draft, refused: 'requires', removed: [], restored: [] }
    }
  }

  doc = settleLook(doc, catalog, trace)
  return { doc, ...trace }
}

/**
 * Put `itemId` on (or take the slot off with `null`). Handles `hides`, `requires` (any-of;
 * an outer with nothing under it gets a default top added), `conflicts`, and reports body
 * sliders that now break the item limits (`clamps`) so the UI can ask "clamp or cancel".
 */
export function applyItem(
  draft: AppearanceV1,
  slot: CatalogSlot,
  itemId: string | null,
  catalog: Catalog = DEFAULT_CATALOG,
  metas?: LimitMetas,
): ApplyResult {
  const raw = applyItemRaw(draft, slot, itemId, catalog)
  if (raw.refused) {
    return { doc: draft, changed: false, refused: raw.refused, removed: [], restored: [], clamps: [] }
  }
  return {
    doc: raw.doc,
    changed: raw.doc !== draft,
    removed: raw.removed,
    restored: raw.restored,
    clamps: bodyClamps(raw.doc, catalog, metas, itemId),
  }
}

// ---------------------------------------------------------------------------
// randomise
// ---------------------------------------------------------------------------

function mergeSlots(draft: AppearanceV1, cand: AppearanceV1, locks: ReadonlySet<LockKey>): AppearanceV1 {
  let doc = draft
  const colors = { ...draft.colors }
  const take = (slot: CatalogSlot): void => {
    if (locks.has(slot)) return
    const id = getSlotItemId(cand, slot)
    doc = setSlotItemId(doc, slot, id)
    if (id && cand.colors[id]) colors[id] = cand.colors[id]
  }
  for (const slot of [
    'hair', 'eyes', 'brows', 'mouth', 'facial_hair', 'fullbody', 'top', 'bottom', 'outer', 'shoes',
    'head', 'glasses', 'ears', 'neck', 'wrist', 'bag',
  ] as const) {
    take(slot)
  }
  if (!locks.has('hair')) doc = { ...doc, hair: { ...doc.hair, color: cand.hair.color } }
  if (!locks.has('eyes')) doc = { ...doc, face: { ...doc.face, eyeColor: cand.face.eyeColor } }
  if (!locks.has('mouth')) doc = { ...doc, face: { ...doc.face, blush: cand.face.blush } }
  if (!locks.has('skin')) doc = { ...doc, skin: cand.skin }
  if (!locks.has('body')) doc = { ...doc, body: { ...cand.body } }
  return { ...doc, colors }
}

/**
 * Seeded random look that keeps the draft's base body and every locked slot. Built on the
 * seeded-look generator (same weights, colour schemes), then settled so hides/requires hold.
 * Unlocked body sliders are clamped to what the new items allow; with the body locked, a
 * candidate whose items need a different body is skipped.
 */
export function randomise(
  draft: AppearanceV1,
  catalog: Catalog = DEFAULT_CATALOG,
  locks: ReadonlySet<LockKey> = new Set(),
  seed: number | string = 0,
  weights: GeneratorWeights = DEFAULT_GENERATOR_WEIGHTS,
): AppearanceV1 {
  let fallback: AppearanceV1 | null = null
  for (let i = 0; i < 64; i += 1) {
    const cand = generateAppearance(`wardrobe:${seed}:${i}`, catalog, { weights })
    if (cand.base !== draft.base) continue
    const merged = settleLook(mergeSlots(draft, cand, locks), catalog)
    const clamps = bodyClamps(merged, catalog)
    if (clamps.length === 0) return merged
    if (!locks.has('body')) return applyClamps(merged, clamps)
    fallback ??= applyClamps(merged, clamps)
  }
  return fallback ?? draft
}

// ---------------------------------------------------------------------------
// presets
// ---------------------------------------------------------------------------

const PRESET_SLOT_ORDER: readonly CatalogSlot[] = [
  'fullbody', 'hair', 'top', 'bottom', 'outer', 'shoes', 'facial_hair',
  'head', 'glasses', 'ears', 'neck', 'wrist', 'bag',
]

function pickWeighted(
  items: readonly CatalogItem[],
  weights: GeneratorWeights,
  base: AppearanceV1['base'],
  r: number,
): CatalogItem {
  const ws = items.map((it) => itemWeight(weights, it, base))
  const total = ws.reduce((a, b) => a + b, 0)
  if (total <= 0) return items[Math.min(Math.floor(r * items.length), items.length - 1)]!
  let x = r * total
  for (let i = 0; i < items.length; i += 1) {
    x -= ws[i]!
    if (x <= 0 && ws[i]! > 0) return items[i]!
  }
  return items[items.length - 1]!
}

/**
 * Dress someone in a preset. Per slot: a seeded weighted pick among catalogue items carrying
 * any of the pick's tags (so new items join automatically), else the fallback id. Slots the
 * preset does not list are left alone; a picked fullbody makes the top/bottom picks moot.
 * Seeded: the same (preset, seed) gives the same look, other seeds give variety.
 */
export function applyPreset(
  draft: AppearanceV1,
  preset: Preset,
  catalog: Catalog = DEFAULT_CATALOG,
  seed: number | string = 0,
  metas?: LimitMetas,
  weights: GeneratorWeights = DEFAULT_GENERATOR_WEIGHTS,
): ApplyResult {
  const rng = makeRng(`preset:${preset.key}:${seed}`)
  const trace: Trace = { removed: [], restored: [] }
  let doc = draft
  let dressPicked = false
  const picked: string[] = []

  for (const slot of PRESET_SLOT_ORDER) {
    const pick = preset.picks[slot]
    if (!pick) continue
    const roll = rng()
    const r = rng()
    if (dressPicked && (slot === 'top' || slot === 'bottom')) continue

    let target: string | null | undefined
    if (!REQUIRED_SLOTS.has(slot) && pick.chance !== undefined && roll >= pick.chance) {
      target = null
    } else {
      const tags = new Set(pick.tagsAny)
      const matches = getSlotItems(catalog, slot, doc.base).filter(
        (it) => !it.retired && it.tags.some((t) => tags.has(t)),
      )
      if (matches.length > 0) {
        target = pickWeighted(matches, weights, doc.base, r).id
      } else if (pick.fallback) {
        const fb = getCatalogItem(catalog, pick.fallback)
        target = fb && fb.slot === slot && hasBaseSupport(fb, doc.base) ? fb.id : undefined
      } else {
        target = pick.chance !== undefined ? null : undefined
      }
    }
    if (target === undefined) continue

    const res = applyItemRaw(doc, slot, target, catalog)
    if (res.refused) continue
    doc = res.doc
    trace.removed.push(...res.removed)
    trace.restored.push(...res.restored)
    if (target) picked.push(target)
    if (slot === 'fullbody' && target) dressPicked = true
  }

  // Colours: tint regions that default to fabric colours follow the preset's palette.
  if (preset.colours) {
    const colors = { ...doc.colors }
    const hidden = hiddenSlots(doc, catalog)
    for (const id of picked) {
      const item = getCatalogItem(catalog, id)
      if (!item?.tint || hidden.has(item.slot)) continue
      const next = { ...(colors[id] ?? {}) }
      for (const region of item.tint.regions) {
        const def = item.tint.defaults[region]
        if (def && !catalog.colorKeys.fabric.has(def)) continue
        const options = (preset.colours[region] ?? []).filter((k) => catalog.palette.has(k))
        if (options.length === 0) continue
        next[region] = options[Math.min(Math.floor(rng() * options.length), options.length - 1)]!
      }
      colors[id] = next
    }
    doc = { ...doc, colors }
  }

  doc = settleLook(doc, catalog, trace)
  return {
    doc,
    changed: doc !== draft,
    removed: trace.removed,
    restored: trace.restored,
    clamps: bodyClamps(doc, catalog, metas),
  }
}

// ---------------------------------------------------------------------------
// diffLooks
// ---------------------------------------------------------------------------

export interface LookDiff {
  base: boolean
  skin: boolean
  /** Sliders whose value differs. */
  body: BodyKey[]
  /** Catalogue slots whose pick differs (hidden picks count). */
  slots: CatalogSlot[]
  hairColor: boolean
  eyeColor: boolean
  blush: boolean
  /** Item ids whose tint colours differ. */
  colors: string[]
  /** True when the two looks are identical (ignoring `updatedAt` / `updatedBy`). */
  same: boolean
}

export function diffLooks(a: AppearanceV1, b: AppearanceV1, catalog: Catalog = DEFAULT_CATALOG): LookDiff {
  const slots = catalogSlotsInOrder(catalog).filter((s) => getSlotItemId(a, s) !== getSlotItemId(b, s))
  const body = BODY_KEYS.filter((k) => a.body[k] !== b.body[k])
  const colorIds = new Set([...Object.keys(a.colors), ...Object.keys(b.colors)])
  const colors = [...colorIds].filter(
    (id) => JSON.stringify(sortKeys(a.colors[id])) !== JSON.stringify(sortKeys(b.colors[id])),
  )
  const d = {
    base: a.base !== b.base,
    skin: a.skin !== b.skin,
    body,
    slots,
    hairColor: a.hair.color !== b.hair.color,
    eyeColor: a.face.eyeColor !== b.face.eyeColor,
    blush: a.face.blush !== b.face.blush,
    colors,
  }
  const same =
    !d.base && !d.skin && !d.hairColor && !d.eyeColor && !d.blush &&
    body.length === 0 && slots.length === 0 && colors.length === 0
  return { ...d, same }
}

function sortKeys(o: Record<string, string | undefined> | undefined): Record<string, string | undefined> {
  if (!o) return {}
  return Object.fromEntries(Object.entries(o).sort(([x], [y]) => (x < y ? -1 : 1)))
}

/** Whether two looks are the same ignoring `updatedAt` / `updatedBy` (dirty tracking). */
export function sameLook(a: AppearanceV1, b: AppearanceV1, catalog: Catalog = DEFAULT_CATALOG): boolean {
  return diffLooks(a, b, catalog).same
}

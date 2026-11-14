import {
  BODY_KEYS,
  type AppearanceBase,
  type AppearanceBody,
  type AppearanceV1,
  type BodyKey,
} from '@/domain/appearance'
import {
  DEFAULT_CATALOG,
  getCatalogItem,
  type Catalog,
  type CatalogSlot,
} from './catalog'

export const SHAPE_KEYS = [
  'Heavy',
  'Slim',
  'Muscle',
  'Chest',
  'Hips',
  'Shoulders',
] as const

export type ShapeKey = (typeof SHAPE_KEYS)[number]

export type BodyLimitKey = ShapeKey | BodyKey
export type BodyLimitMap = Partial<Record<BodyLimitKey, [number, number]>>

export interface MappedBody {
  scale: number
  weights: Record<ShapeKey, number>
}

export interface WardrobeLimitMeta {
  bodyLimits?: BodyLimitMap
  bases?: Partial<Record<AppearanceBase, { bodyLimits?: BodyLimitMap }>>
}

const ALL_LIMIT_KEYS: readonly BodyLimitKey[] = [...SHAPE_KEYS, ...BODY_KEYS]

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const clamped = value < lo ? lo : value > hi ? hi : value
  return clamped === 0 ? 0 : clamped
}

function clampSlider(
  value: number,
  range: [number, number] | undefined,
): number {
  const unit = clamp(value, 0, 1)
  return range ? clamp(unit, range[0], range[1]) : unit
}

function intersectRange(
  current: [number, number] | undefined,
  next: [number, number],
): [number, number] {
  const nextLo = clamp(next[0], 0, 1)
  const nextHi = clamp(next[1], 0, 1)
  const normLo = Math.min(nextLo, nextHi)
  const normHi = Math.max(nextLo, nextHi)
  if (!current) return [normLo, normHi]

  const lo = Math.max(current[0], normLo)
  const hi = Math.min(current[1], normHi)
  if (lo > hi) {
    const mid = clamp((lo + hi) / 2, 0, 1)
    return [mid, mid]
  }
  return [lo, hi]
}

function mergeLimitsInto(target: BodyLimitMap, source: BodyLimitMap | undefined): void {
  if (!source) return
  for (const key of ALL_LIMIT_KEYS) {
    const range = source[key]
    if (!range) continue
    target[key] = intersectRange(target[key], range)
  }
}

function lookupMeta(
  metas:
    | ReadonlyMap<string, WardrobeLimitMeta>
    | Readonly<Record<string, WardrobeLimitMeta | undefined>>
    | undefined,
  id: string,
): WardrobeLimitMeta | undefined {
  if (!metas) return undefined
  if (metas instanceof Map) {
    return metas.get(id)
  }
  return (metas as Readonly<Record<string, WardrobeLimitMeta | undefined>>)[id]
}

/**
 * Map `AppearanceV1.body` sliders (0..1) into uniform root scale and baked
 * morph target weights per §3.3, clamping to optional `limits`.
 */
export function mapBodySliders(
  body: AppearanceBody,
  limits?: BodyLimitMap,
): MappedBody {
  const height = clampSlider(body.height, limits?.height)
  const build = clampSlider(body.build, limits?.build)
  const muscle = clampSlider(body.muscle, limits?.muscle)
  const chest = clampSlider(body.chest, limits?.chest)
  const hips = clampSlider(body.hips, limits?.hips)
  const shoulders = clampSlider(body.shoulders, limits?.shoulders)

  const scale = 0.92 + (1.08 - 0.92) * height
  const slimRaw = build < 0.5 ? (0.5 - build) * 1.2 : 0
  const heavyRaw = build > 0.5 ? (build - 0.5) * 1.6 : 0

  const weights: Record<ShapeKey, number> = {
    Heavy: clampSlider(heavyRaw, limits?.Heavy),
    Slim: clampSlider(slimRaw, limits?.Slim),
    Muscle: clampSlider(muscle * 0.8, limits?.Muscle),
    Chest: clampSlider(chest, limits?.Chest),
    Hips: clampSlider(hips, limits?.Hips),
    Shoulders: clampSlider(shoulders, limits?.Shoulders),
  }

  return { scale, weights }
}

/**
 * Intersect `bodyLimits` across all actively worn items on an appearance
 * (skipping slots hidden by another worn item such as `fullbody` hiding `top`/`bottom`).
 */
export function effectiveLimits(
  appearance: AppearanceV1,
  catalog: Catalog = DEFAULT_CATALOG,
  metas?:
    | ReadonlyMap<string, WardrobeLimitMeta>
    | Readonly<Record<string, WardrobeLimitMeta | undefined>>,
): BodyLimitMap {
  const candidateIds: Array<{ slot: CatalogSlot; id: string }> = []

  if (appearance.hair.item) {
    candidateIds.push({ slot: 'hair', id: appearance.hair.item })
  }
  if (appearance.face.facialHair) {
    candidateIds.push({ slot: 'facial_hair', id: appearance.face.facialHair })
  }
  if (appearance.outfit.fullbody) {
    candidateIds.push({ slot: 'fullbody', id: appearance.outfit.fullbody })
  }
  if (appearance.outfit.outer) {
    candidateIds.push({ slot: 'outer', id: appearance.outfit.outer })
  }
  if (appearance.outfit.top) {
    candidateIds.push({ slot: 'top', id: appearance.outfit.top })
  }
  if (appearance.outfit.bottom) {
    candidateIds.push({ slot: 'bottom', id: appearance.outfit.bottom })
  }
  if (appearance.outfit.shoes) {
    candidateIds.push({ slot: 'shoes', id: appearance.outfit.shoes })
  }
  for (const [slot, id] of Object.entries(appearance.accessories)) {
    if (id) {
      candidateIds.push({ slot: slot as CatalogSlot, id })
    }
  }

  const hiddenSlots = new Set<CatalogSlot>()
  for (const entry of candidateIds) {
    const item = getCatalogItem(catalog, entry.id)
    if (!item) continue
    for (const h of item.hides) {
      hiddenSlots.add(h)
    }
  }

  const result: BodyLimitMap = {}
  for (const entry of candidateIds) {
    const item = getCatalogItem(catalog, entry.id)
    const effectiveSlot = item?.slot ?? entry.slot
    if (hiddenSlots.has(effectiveSlot)) continue

    if (item?.bodyLimits) {
      mergeLimitsInto(result, item.bodyLimits)
    }
    const meta = lookupMeta(metas, entry.id)
    if (meta) {
      mergeLimitsInto(result, meta.bodyLimits)
      mergeLimitsInto(result, meta.bases?.[appearance.base]?.bodyLimits)
    }
  }

  return result
}

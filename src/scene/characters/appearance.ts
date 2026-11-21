import {
  ACCESSORY_SLOTS,
  AppearanceV1Schema,
  BODY_KEYS,
  BodyKeySchema,
  DEFAULT_APPEARANCE_BODY,
  DEFAULT_UPDATED_AT,
  StrictAppearanceV1Schema,
  TINT_REGIONS,
  type AccessorySlot,
  type AppearanceAccessories,
  type AppearanceBase,
  type AppearanceBody,
  type AppearanceColors,
  type AppearanceTintRegion,
  type AppearanceV1,
  type BodyKey,
} from '@/domain/appearance'
import { hashString } from '@/scene/director/rng'
import {
  DEFAULT_CATALOG,
  getCatalogItem,
  getDefaultColorKey,
  getSlotDefaultId,
  hasBaseSupport,
  isValidColorKey,
  type Catalog,
  type CatalogSlot,
} from './catalog'

export {
  AppearanceV1Schema,
  BodyKeySchema,
  StrictAppearanceV1Schema,
  type AppearanceV1,
  type BodyKey,
}

const ISO_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

const LEGACY_ACCESSORY_KEYS: Record<string, AccessorySlot> = {
  head: 'head',
  hairAcc: 'head',
  glasses: 'glasses',
  ears: 'ears',
  earrings: 'ears',
  neck: 'neck',
  wrist: 'wrist',
  watch: 'wrist',
  bag: 'bag',
  back: 'bag',
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function defaultWarn(msg: string): void {
  console.warn(msg)
}

function resolveCatalogItemId(
  rawId: unknown,
  slot: CatalogSlot,
  base: AppearanceBase,
  catalog: Catalog,
  fallback: string | null,
  issues: string[],
  label: string,
): string | null {
  if (rawId === undefined) return fallback
  if (rawId === null) return null
  if (typeof rawId !== 'string' || rawId.trim().length === 0) {
    issues.push(`invalid ${label} "${String(rawId)}" -> ${String(fallback)}`)
    return fallback
  }
  const item = getCatalogItem(catalog, rawId)
  if (!item || item.slot !== slot || !hasBaseSupport(item, base)) {
    issues.push(
      `unknown/unsupported ${label} "${rawId}" for base "${base}" -> ${String(fallback)}`,
    )
    return fallback
  }
  return item.id
}

/**
 * Migrate any unknown/v0/partial/malformed appearance document into a valid
 * canonical `AppearanceV1`. Unknown item ids, invalid base, or unknown colours
 * fall back to slot defaults and emit at most one warning per call.
 */
export function migrateAppearance(
  input: unknown,
  catalog: Catalog = DEFAULT_CATALOG,
  warn: (msg: string) => void = defaultWarn,
): AppearanceV1 {
  const issues: string[] = []
  const raw = isPlainRecord(input) ? input : {}

  if (!isPlainRecord(input)) {
    issues.push('non-object input')
  } else if (raw.v !== 1) {
    issues.push(`migrated v=${String(raw.v)} -> 1`)
  }

  // Base body
  let base: AppearanceBase = 'female'
  if (raw.base === 'female' || raw.base === 'male') {
    base = raw.base
  } else if (raw.base !== undefined) {
    issues.push(`invalid base "${String(raw.base)}" -> "female"`)
  } else {
    issues.push('missing base -> "female"')
  }

  // Body sliders (0..1)
  const rawBody = isPlainRecord(raw.body) ? raw.body : {}
  const body = { ...DEFAULT_APPEARANCE_BODY } as AppearanceBody
  for (const key of BODY_KEYS) {
    const val = rawBody[key]
    if (typeof val === 'number' && Number.isFinite(val)) {
      const clamped = clamp01(val)
      if (clamped !== val) {
        issues.push(`clamped body.${key} ${val} -> ${clamped}`)
      }
      body[key] = clamped
    } else if (val !== undefined) {
      issues.push(`invalid body.${key} -> ${body[key]}`)
    }
  }

  // Skin swatch
  const defaultSkin = isValidColorKey(catalog, 'skin', 'skin_03')
    ? 'skin_03'
    : getDefaultColorKey(catalog, 'skin')
  let skin = defaultSkin
  if (typeof raw.skin === 'string') {
    if (isValidColorKey(catalog, 'skin', raw.skin)) {
      skin = raw.skin
    } else {
      issues.push(`unknown skin "${raw.skin}" -> "${defaultSkin}"`)
    }
  } else if (raw.skin !== undefined) {
    issues.push(`invalid skin -> "${defaultSkin}"`)
  }

  // Face
  const rawFace = isPlainRecord(raw.face) ? raw.face : {}
  const defaultEyes = getSlotDefaultId(catalog, 'eyes', base) ?? 'eyes_01'
  const defaultBrows = getSlotDefaultId(catalog, 'brows', base) ?? 'brows_01'
  const defaultMouth = getSlotDefaultId(catalog, 'mouth', base) ?? 'mouth_01'
  const defaultEyeColor = getDefaultColorKey(catalog, 'eyes')

  const eyes =
    resolveCatalogItemId(
      rawFace.eyes,
      'eyes',
      base,
      catalog,
      defaultEyes,
      issues,
      'face.eyes',
    ) ?? defaultEyes
  const brows =
    resolveCatalogItemId(
      rawFace.brows,
      'brows',
      base,
      catalog,
      defaultBrows,
      issues,
      'face.brows',
    ) ?? defaultBrows
  const mouth =
    resolveCatalogItemId(
      rawFace.mouth,
      'mouth',
      base,
      catalog,
      defaultMouth,
      issues,
      'face.mouth',
    ) ?? defaultMouth

  let eyeColor = defaultEyeColor
  if (typeof rawFace.eyeColor === 'string') {
    if (isValidColorKey(catalog, 'eyes', rawFace.eyeColor)) {
      eyeColor = rawFace.eyeColor
    } else {
      issues.push(
        `unknown face.eyeColor "${rawFace.eyeColor}" -> "${defaultEyeColor}"`,
      )
    }
  } else if (rawFace.eyeColor !== undefined) {
    issues.push(`invalid face.eyeColor -> "${defaultEyeColor}"`)
  }

  const facialHair = resolveCatalogItemId(
    rawFace.facialHair,
    'facial_hair',
    base,
    catalog,
    null,
    issues,
    'face.facialHair',
  )

  let blush = false
  if (typeof rawFace.blush === 'boolean') {
    blush = rawFace.blush
  } else if (rawFace.blush !== undefined) {
    issues.push(`invalid face.blush -> false`)
  }

  // Hair (accepts canonical `hair.item` or legacy `hair.id`)
  const rawHair = isPlainRecord(raw.hair) ? raw.hair : {}
  const defaultHairId = getSlotDefaultId(catalog, 'hair', base)
  const rawHairItem =
    rawHair.item !== undefined ? rawHair.item : rawHair.id
  const hairItem = resolveCatalogItemId(
    rawHairItem,
    'hair',
    base,
    catalog,
    defaultHairId,
    issues,
    'hair.item',
  )

  const defaultHairColor = getDefaultColorKey(catalog, 'hair')
  let hairColor = defaultHairColor
  if (typeof rawHair.color === 'string') {
    if (isValidColorKey(catalog, 'hair', rawHair.color)) {
      hairColor = rawHair.color
    } else {
      issues.push(
        `unknown hair.color "${rawHair.color}" -> "${defaultHairColor}"`,
      )
    }
  } else if (rawHair.color !== undefined) {
    issues.push(`invalid hair.color -> "${defaultHairColor}"`)
  }

  // Outfit
  const rawOutfit = isPlainRecord(raw.outfit) ? raw.outfit : {}
  const fullbody = resolveCatalogItemId(
    rawOutfit.fullbody,
    'fullbody',
    base,
    catalog,
    null,
    issues,
    'outfit.fullbody',
  )
  const fullbodyItem = fullbody ? getCatalogItem(catalog, fullbody) : undefined
  const fullbodyHidesTop = fullbodyItem?.hides.includes('top') ?? false
  const fullbodyHidesBottom = fullbodyItem?.hides.includes('bottom') ?? false

  const defaultTop = getSlotDefaultId(catalog, 'top', base)
  const defaultBottom = getSlotDefaultId(catalog, 'bottom', base)
  const defaultShoes = getSlotDefaultId(catalog, 'shoes', base)

  let top = resolveCatalogItemId(
    rawOutfit.top,
    'top',
    base,
    catalog,
    fullbodyHidesTop ? null : defaultTop,
    issues,
    'outfit.top',
  )
  if (top === null && !fullbodyHidesTop && defaultTop !== null) {
    top = defaultTop
  }

  let bottom = resolveCatalogItemId(
    rawOutfit.bottom,
    'bottom',
    base,
    catalog,
    fullbodyHidesBottom ? null : defaultBottom,
    issues,
    'outfit.bottom',
  )
  if (bottom === null && !fullbodyHidesBottom && defaultBottom !== null) {
    bottom = defaultBottom
  }

  const outer = resolveCatalogItemId(
    rawOutfit.outer,
    'outer',
    base,
    catalog,
    null,
    issues,
    'outfit.outer',
  )

  const shoes = resolveCatalogItemId(
    rawOutfit.shoes,
    'shoes',
    base,
    catalog,
    defaultShoes,
    issues,
    'outfit.shoes',
  )

  // Accessories (supports canonical keys and legacy aliases)
  const accessories: AppearanceAccessories = {}
  const rawAcc = isPlainRecord(raw.accessories) ? raw.accessories : {}
  for (const [rawSlot, rawVal] of Object.entries(rawAcc)) {
    const mappedSlot = LEGACY_ACCESSORY_KEYS[rawSlot]
    if (!mappedSlot) {
      if (rawVal !== undefined && rawVal !== null) {
        issues.push(`unknown accessory slot "${rawSlot}" dropped`)
      }
      continue
    }
    if (rawVal === undefined || rawVal === null) continue
    // Prefer canonical key if both canonical and legacy alias appear
    if (rawSlot !== mappedSlot && rawAcc[mappedSlot] !== undefined) continue
    const resolved = resolveCatalogItemId(
      rawVal,
      mappedSlot,
      base,
      catalog,
      null,
      issues,
      `accessories.${mappedSlot}`,
    )
    if (resolved !== null) {
      accessories[mappedSlot] = resolved
    }
  }

  // Ensure canonical key order on accessories
  const orderedAccessories: AppearanceAccessories = {}
  for (const slot of ACCESSORY_SLOTS) {
    const id = accessories[slot]
    if (id !== undefined) orderedAccessories[slot] = id
  }

  // Item tint colours
  const colors: AppearanceColors = {}
  const rawColors = isPlainRecord(raw.colors) ? raw.colors : {}
  const defaultFabric = getDefaultColorKey(catalog, 'fabric')
  for (const [itemId, regionObj] of Object.entries(rawColors)) {
    const item = getCatalogItem(catalog, itemId)
    if (!item || !hasBaseSupport(item, base)) {
      issues.push(`colors entry for unknown/unsupported item "${itemId}" dropped`)
      continue
    }
    if (!isPlainRecord(regionObj)) {
      issues.push(`invalid colors["${itemId}"] dropped`)
      continue
    }
    if (!item.tint) continue
    const nextRegions: Partial<Record<AppearanceTintRegion, string>> = {}
    for (const region of TINT_REGIONS) {
      if (!item.tint.regions.includes(region)) continue
      const rawColor = regionObj[region]
      if (rawColor === undefined) continue
      const regionDefault = item.tint.defaults[region] ?? defaultFabric
      if (typeof rawColor === 'string' && catalog.palette.has(rawColor)) {
        nextRegions[region] = rawColor
      } else {
        issues.push(
          `unknown color "${String(rawColor)}" for ${itemId}.${region} -> "${regionDefault}"`,
        )
        nextRegions[region] = regionDefault
      }
    }
    if (Object.keys(nextRegions).length > 0) {
      colors[itemId] = nextRegions
    }
  }

  const updatedAt =
    typeof raw.updatedAt === 'string' && ISO_RE.test(raw.updatedAt)
      ? raw.updatedAt
      : DEFAULT_UPDATED_AT
  const updatedBy =
    typeof raw.updatedBy === 'string' && raw.updatedBy.trim().length > 0
      ? raw.updatedBy
      : 'migrated'

  const doc: AppearanceV1 = {
    v: 1,
    base,
    body,
    skin,
    face: {
      eyes,
      brows,
      mouth,
      eyeColor,
      facialHair,
      blush,
    },
    hair: {
      item: hairItem,
      color: hairColor,
    },
    outfit: {
      top,
      bottom,
      fullbody,
      outer,
      shoes,
    },
    accessories: orderedAccessories,
    colors,
    updatedAt,
    updatedBy,
  }

  if (issues.length > 0) {
    warn(`[migrateAppearance] ${issues.join('; ')}`)
  }

  return StrictAppearanceV1Schema.parse(doc)
}

function canonicalize(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null'
    return Object.is(value, -0) ? '0' : JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? 'null' : canonicalize(v))).join(',')}]`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort()
    const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(record[k])}`)
    return `{${entries.join(',')}}`
  }
  return 'null'
}

/**
 * Deterministic hash of an `AppearanceV1` document, independent of object key
 * insertion order. Returns a 16-char lowercase hex digest.
 */
export function hashAppearance(doc: AppearanceV1): string {
  const canonical = canonicalize(doc)
  const h1 = hashString(canonical).toString(16).padStart(8, '0')
  const h2 = hashString(`\u0000${canonical}`).toString(16).padStart(8, '0')
  return `${h1}${h2}`
}

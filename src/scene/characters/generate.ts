import {
  DEFAULT_UPDATED_AT,
  StrictAppearanceV1Schema,
  type AppearanceBase,
  type AppearanceBody,
  type AppearanceColors,
  type AppearanceV1,
} from '@/domain/appearance'
import { makeRng, type Rng } from '@/scene/director/rng'
import {
  DEFAULT_CATALOG,
  getDefaultColorKey,
  getSlotItems,
  type Catalog,
  type CatalogItem,
  type CatalogSlot,
} from './catalog'
import {
  DEFAULT_GENERATOR_WEIGHTS,
  itemWeight,
  slotChance,
  type GeneratorWeights,
} from './generatorWeights'

export interface GenerateAppearanceOptions {
  name?: string
  /** Seeded-look weights; defaults to `catalog/generator-weights.json`. */
  weights?: GeneratorWeights
}

interface OutfitColorScheme {
  topPrimary: string
  topSecondary: string
  bottomPrimary: string
  dressPrimary: string
  shoesPrimary: string
  shoesAccent: string
}

const OUTFIT_COLOR_SCHEMES: readonly OutfitColorScheme[] = [
  { topPrimary: 'c_white', topSecondary: 'c_navy', bottomPrimary: 'c_navy', dressPrimary: 'c_navy', shoesPrimary: 'c_brown', shoesAccent: 'c_white' },
  { topPrimary: 'c_sky', topSecondary: 'c_white', bottomPrimary: 'c_charcoal', dressPrimary: 'c_sky', shoesPrimary: 'c_black', shoesAccent: 'c_white' },
  { topPrimary: 'c_jade', topSecondary: 'c_white', bottomPrimary: 'c_black', dressPrimary: 'c_jade', shoesPrimary: 'c_white', shoesAccent: 'c_jade' },
  { topPrimary: 'c_navy', topSecondary: 'c_sky', bottomPrimary: 'c_khaki', dressPrimary: 'c_navy', shoesPrimary: 'c_brown', shoesAccent: 'c_khaki' },
  { topPrimary: 'c_rose', topSecondary: 'c_white', bottomPrimary: 'c_denim', dressPrimary: 'c_rose', shoesPrimary: 'c_white', shoesAccent: 'c_rose' },
  { topPrimary: 'c_charcoal', topSecondary: 'c_grey', bottomPrimary: 'c_denim', dressPrimary: 'c_charcoal', shoesPrimary: 'c_black', shoesAccent: 'c_grey' },
  { topPrimary: 'c_orange', topSecondary: 'c_white', bottomPrimary: 'c_navy', dressPrimary: 'c_orange', shoesPrimary: 'c_white', shoesAccent: 'c_orange' },
  { topPrimary: 'c_purple', topSecondary: 'c_white', bottomPrimary: 'c_charcoal', dressPrimary: 'c_purple', shoesPrimary: 'c_black', shoesAccent: 'c_purple' },
  { topPrimary: 'c_green', topSecondary: 'c_khaki', bottomPrimary: 'c_khaki', dressPrimary: 'c_green', shoesPrimary: 'c_brown', shoesAccent: 'c_white' },
  { topPrimary: 'c_red', topSecondary: 'c_white', bottomPrimary: 'c_black', dressPrimary: 'c_red', shoesPrimary: 'c_white', shoesAccent: 'c_red' },
  { topPrimary: 'c_yellow', topSecondary: 'c_navy', bottomPrimary: 'c_denim', dressPrimary: 'c_yellow', shoesPrimary: 'c_white', shoesAccent: 'c_navy' },
  { topPrimary: 'c_grey', topSecondary: 'c_jade', bottomPrimary: 'c_black', dressPrimary: 'c_grey', shoesPrimary: 'c_black', shoesAccent: 'c_jade' },
  { topPrimary: 'c_white', topSecondary: 'c_black', bottomPrimary: 'c_denim', dressPrimary: 'c_white', shoesPrimary: 'c_white', shoesAccent: 'c_black' },
  { topPrimary: 'c_sky', topSecondary: 'c_navy', bottomPrimary: 'c_khaki', dressPrimary: 'c_sky', shoesPrimary: 'c_brown', shoesAccent: 'c_white' },
  { topPrimary: 'c_jade', topSecondary: 'c_black', bottomPrimary: 'c_charcoal', dressPrimary: 'c_jade', shoesPrimary: 'c_black', shoesAccent: 'c_white' },
  { topPrimary: 'c_purple', topSecondary: 'c_grey', bottomPrimary: 'c_black', dressPrimary: 'c_purple', shoesPrimary: 'c_white', shoesAccent: 'c_purple' },
  { topPrimary: 'c_red', topSecondary: 'c_black', bottomPrimary: 'c_navy', dressPrimary: 'c_red', shoesPrimary: 'c_brown', shoesAccent: 'c_white' },
  { topPrimary: 'c_orange', topSecondary: 'c_charcoal', bottomPrimary: 'c_black', dressPrimary: 'c_orange', shoesPrimary: 'c_black', shoesAccent: 'c_orange' },
  { topPrimary: 'c_khaki', topSecondary: 'c_white', bottomPrimary: 'c_navy', dressPrimary: 'c_khaki', shoesPrimary: 'c_brown', shoesAccent: 'c_white' },
  { topPrimary: 'c_denim', topSecondary: 'c_white', bottomPrimary: 'c_khaki', dressPrimary: 'c_denim', shoesPrimary: 'c_white', shoesAccent: 'c_denim' },
]

const SEED_BASE_BY_ID: Readonly<Record<string, AppearanceBase>> = {
  emp_giam_doc: 'male',
  emp_pho_giam_doc: 'female',
  emp_thu: 'female',
  emp_ngoc: 'female',
  emp_linh: 'female',
  emp_an: 'female',
  emp_quan: 'male',
  emp_mai: 'female',
  emp_trang: 'female',
  emp_phuc: 'male',
  emp_hai: 'male',
  emp_ha: 'female',
  emp_khanh: 'male',
  emp_yen: 'female',
  emp_duy: 'male',
  emp_bao: 'male',
  emp_thao: 'female',
  emp_minh: 'male',
  emp_vy: 'female',
  emp_tu: 'male',
  emp_long: 'male',
  emp_nhi: 'female',
  emp_tam: 'female',
  emp_lan: 'female',
  emp_hung: 'male',
  emp_oanh: 'female',
  emp_viet: 'male',
  emp_hanh: 'female',
}

const FEMALE_GIVEN_NAMES = new Set([
  'thu',
  'ngoc',
  'linh',
  'mai',
  'trang',
  'ha',
  'yen',
  'thao',
  'vy',
  'nhi',
  'tam',
  'lan',
  'oanh',
  'hanh',
  'my',
  'hoa',
  'thu',
  'chau',
  'nhung',
  'huong',
  'phuong',
  'anh',
  'chi',
  'quynh',
  'van',
])

const MALE_GIVEN_NAMES = new Set([
  'quan',
  'phuc',
  'hai',
  'khanh',
  'duy',
  'bao',
  'minh',
  'tu',
  'long',
  'hung',
  'viet',
  'binh',
  'hieu',
  'lam',
  'nam',
  'dung',
  'tuan',
  'dat',
  'khang',
  'son',
  'phong',
  'khoa',
])

function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

function inferBase(
  employeeId: string,
  name: string | undefined,
  rng: Rng,
): AppearanceBase {
  const known = SEED_BASE_BY_ID[employeeId]
  if (known) return known

  if (name) {
    const firstToken = stripDiacritics(name).trim().split(/[\s(]+/)[0] ?? ''
    if (FEMALE_GIVEN_NAMES.has(firstToken)) return 'female'
    if (MALE_GIVEN_NAMES.has(firstToken)) return 'male'
  }

  return rng() < 0.5 ? 'female' : 'male'
}

function pickFrom<T>(items: readonly T[], rng: Rng): T {
  const idx = Math.floor(rng() * items.length)
  return items[Math.min(idx, items.length - 1)] as T
}

function pickWeighted<T>(
  entries: ReadonlyArray<{ value: T; weight: number }>,
  rng: Rng,
): T {
  const total = entries.reduce((sum, e) => sum + e.weight, 0)
  let r = rng() * total
  for (const entry of entries) {
    r -= entry.weight
    if (r <= 0) return entry.value
  }
  return (entries[entries.length - 1] as { value: T }).value
}

/** Weighted pick by `generator-weights.json`; uniform when every weight is 0. */
function pickItem(
  items: readonly CatalogItem[],
  weights: GeneratorWeights,
  base: AppearanceBase,
  rng: Rng,
): CatalogItem {
  const entries = items.map((item) => ({ value: item, weight: itemWeight(weights, item, base) }))
  if (entries.every((e) => e.weight <= 0)) return pickFrom(items, rng)
  return pickWeighted(
    entries.filter((e) => e.weight > 0),
    rng,
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function rangeValue(min: number, max: number, rng: Rng): number {
  return round2(min + (max - min) * rng())
}

function resolveColor(catalog: Catalog, preferred: string, fallback: string): string {
  if (catalog.colorKeys.fabric.has(preferred) || catalog.palette.has(preferred)) {
    return preferred
  }
  return fallback
}

function buildItemColors(
  item: CatalogItem,
  primary: string,
  secondary: string,
  accent: string,
  catalog: Catalog,
  fallbackFabric: string,
): Partial<Record<'primary' | 'secondary' | 'accent', string>> | undefined {
  if (!item.tint) return undefined
  const out: Partial<Record<'primary' | 'secondary' | 'accent', string>> = {}
  for (const region of item.tint.regions) {
    const desired =
      region === 'primary' ? primary : region === 'secondary' ? secondary : accent
    const def = item.tint.defaults[region] ?? fallbackFabric
    out[region] = resolveColor(catalog, desired, def)
  }
  return out
}

/**
 * Deterministically generate a complete, catalogue-valid `AppearanceV1` for an
 * employee id using a seeded PRNG (no `Math.random()`).
 */
export function generateAppearance(
  employeeId: string,
  catalog: Catalog = DEFAULT_CATALOG,
  opts?: GenerateAppearanceOptions,
): AppearanceV1 {
  const rng = makeRng(`appearance:${employeeId}`)
  const base = inferBase(employeeId, opts?.name, rng)
  const weights = opts?.weights ?? DEFAULT_GENERATOR_WEIGHTS
  const pick = (items: readonly CatalogItem[]) => pickItem(items, weights, base, rng)
  /** Roll for an optional slot; no RNG draw when the slot cannot be worn. */
  const wears = (slot: CatalogSlot, options: readonly CatalogItem[]) => {
    const chance = slotChance(weights, slot, base)
    return options.length > 0 && chance > 0 && rng() < chance
  }

  // Body proportions (natural office variation within 0..1)
  const body: AppearanceBody = {
    height: rangeValue(0.15, 0.85, rng),
    build: rangeValue(0.2, 0.72, rng),
    muscle: base === 'male' ? rangeValue(0.15, 0.65, rng) : rangeValue(0.05, 0.35, rng),
    chest: base === 'female' ? rangeValue(0.2, 0.7, rng) : rangeValue(0.1, 0.45, rng),
    hips: base === 'female' ? rangeValue(0.25, 0.75, rng) : rangeValue(0.1, 0.45, rng),
    shoulders:
      base === 'male' ? rangeValue(0.3, 0.8, rng) : rangeValue(0.15, 0.55, rng),
  }

  // Skin tone
  const skinChoices = catalog.colors.skin
  const naturalSkins = skinChoices.slice(0, Math.min(5, skinChoices.length))
  const skinPool = naturalSkins.length > 0 && rng() < 0.85 ? naturalSkins : skinChoices
  const skin = pickFrom(skinPool, rng).key

  // Hair item & colour
  const hairOptions = getSlotItems(catalog, 'hair', base)
  const hairItem = hairOptions.length > 0 ? pick(hairOptions).id : null

  const naturalHairColors = catalog.colors.hair.filter((c) => !c.fashion)
  const fashionHairColors = catalog.colors.hair.filter((c) => c.fashion)
  const useFashionHair = fashionHairColors.length > 0 && rng() < 0.12
  const hairColorPool = useFashionHair
    ? fashionHairColors
    : naturalHairColors.length > 0
      ? naturalHairColors
      : catalog.colors.hair
  const hairColor = pickFrom(hairColorPool, rng).key

  // Face
  const eyesOptions = getSlotItems(catalog, 'eyes', base)
  const browsOptions = getSlotItems(catalog, 'brows', base)
  const mouthOptions = getSlotItems(catalog, 'mouth', base)
  const eyes = eyesOptions.length > 0 ? pick(eyesOptions).id : 'eyes_01'
  const brows = browsOptions.length > 0 ? pick(browsOptions).id : 'brows_01'
  const mouth = mouthOptions.length > 0 ? pick(mouthOptions).id : 'mouth_01'
  const eyeColor = pickFrom(catalog.colors.eyes, rng).key
  const blush = base === 'female' ? rng() < 0.35 : false
  const facialHairOptions = getSlotItems(catalog, 'facial_hair', base)
  const facialHair = wears('facial_hair', facialHairOptions) ? pick(facialHairOptions).id : null

  // Outfit
  const fullbodyOptions = getSlotItems(catalog, 'fullbody', base)
  const topOptions = getSlotItems(catalog, 'top', base)
  const bottomOptions = getSlotItems(catalog, 'bottom', base)
  const shoesOptions = getSlotItems(catalog, 'shoes', base)

  const defaultFabric = getDefaultColorKey(catalog, 'fabric')
  const validSchemes = OUTFIT_COLOR_SCHEMES.filter(
    (s) =>
      catalog.colorKeys.fabric.has(s.topPrimary) &&
      catalog.colorKeys.fabric.has(s.bottomPrimary),
  )
  const fabricList = catalog.colors.fabric
  const scheme: OutfitColorScheme =
    validSchemes.length > 0
      ? pickFrom(validSchemes, rng)
      : {
          topPrimary: pickFrom(fabricList, rng).key,
          topSecondary: pickFrom(fabricList, rng).key,
          bottomPrimary: pickFrom(fabricList, rng).key,
          dressPrimary: pickFrom(fabricList, rng).key,
          shoesPrimary: pickFrom(fabricList, rng).key,
          shoesAccent: pickFrom(fabricList, rng).key,
        }

  const colors: AppearanceColors = {}

  let fullbody: string | null = null
  let top: string | null = null
  let bottom: string | null = null

  const wearFullbody =
    fullbodyOptions.length > 0 && (topOptions.length === 0 || wears('fullbody', fullbodyOptions))

  if (wearFullbody) {
    const dress = pick(fullbodyOptions)
    fullbody = dress.id
    const c = buildItemColors(
      dress,
      scheme.dressPrimary,
      scheme.topSecondary,
      scheme.shoesAccent,
      catalog,
      defaultFabric,
    )
    if (c) colors[dress.id] = c
  } else {
    if (topOptions.length > 0) {
      const chosenTop = pick(topOptions)
      top = chosenTop.id
      const c = buildItemColors(
        chosenTop,
        scheme.topPrimary,
        scheme.topSecondary,
        scheme.topSecondary,
        catalog,
        defaultFabric,
      )
      if (c) colors[chosenTop.id] = c
    }
    if (bottomOptions.length > 0) {
      const chosenBottom = pick(bottomOptions)
      bottom = chosenBottom.id
      const c = buildItemColors(
        chosenBottom,
        scheme.bottomPrimary,
        scheme.topSecondary,
        scheme.shoesAccent,
        catalog,
        defaultFabric,
      )
      if (c) colors[chosenBottom.id] = c
    }
  }

  // Outer layer (needs a top or a fullbody underneath: catalogue `requires`).
  let outer: string | null = null
  const outerOptions = getSlotItems(catalog, 'outer', base)
  if ((top || fullbody) && wears('outer', outerOptions)) {
    const inner = top ?? fullbody
    const innerItem = inner ? catalog.byId.get(inner) : undefined
    // Never pick a pair where either row lists the other in `conflicts` (layering test, P08a-T10).
    const compatible = outerOptions.filter(
      (o) => !o.conflicts?.includes(inner ?? '') && !innerItem?.conflicts?.includes(o.id),
    )
    if (compatible.length > 0) {
      const chosenOuter = pick(compatible)
      outer = chosenOuter.id
      const c = buildItemColors(
        chosenOuter,
        scheme.bottomPrimary,
        scheme.topPrimary,
        scheme.topSecondary,
        catalog,
        defaultFabric,
      )
      if (c) colors[chosenOuter.id] = c
    }
  }

  let shoes: string | null = null
  if (shoesOptions.length > 0) {
    const chosenShoes = pick(shoesOptions)
    shoes = chosenShoes.id
    const c = buildItemColors(
      chosenShoes,
      scheme.shoesPrimary,
      scheme.shoesAccent,
      scheme.shoesAccent,
      catalog,
      defaultFabric,
    )
    if (c) colors[chosenShoes.id] = c
  }

  // Accessories
  const accessories: AppearanceV1['accessories'] = {}
  const glassesOptions = getSlotItems(catalog, 'glasses', base)
  if (wears('glasses', glassesOptions)) {
    const glasses = pick(glassesOptions)
    accessories.glasses = glasses.id
    const frameColor = pickFrom(['c_black', 'c_charcoal', 'c_brown'], rng)
    const c = buildItemColors(
      glasses,
      frameColor,
      frameColor,
      frameColor,
      catalog,
      defaultFabric,
    )
    if (c) colors[glasses.id] = c
  }

  const neckOptions = getSlotItems(catalog, 'neck', base)
  if (wears('neck', neckOptions)) {
    const neck = pick(neckOptions)
    accessories.neck = neck.id
    // Jewellery keeps its metal defaults; cloth (tie, scarf, lanyard) follows the outfit.
    const isMetal = Object.values(neck.tint?.defaults ?? {}).some((k) =>
      catalog.colorKeys.metal.has(k),
    )
    const c = isMetal ? undefined : buildItemColors(
      neck,
      scheme.shoesAccent,
      scheme.topSecondary,
      scheme.topPrimary,
      catalog,
      defaultFabric,
    )
    if (c) colors[neck.id] = c
  }

  // Remaining accessories keep their catalogue default colours (metal for jewellery).
  for (const slot of ['ears', 'wrist', 'head', 'bag'] as const) {
    const options = getSlotItems(catalog, slot, base)
    if (wears(slot, options)) accessories[slot] = pick(options).id
  }

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
    accessories,
    colors,
    updatedAt: DEFAULT_UPDATED_AT,
    updatedBy: 'generator',
  }

  return StrictAppearanceV1Schema.parse(doc)
}

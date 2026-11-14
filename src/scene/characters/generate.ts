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
} from './catalog'

export interface GenerateAppearanceOptions {
  name?: string
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
  let hairItem: string | null = null
  if (hairOptions.length > 0) {
    const preferredOrder =
      base === 'female'
        ? ['hair_long_01', 'hair_bob_01', 'hair_bun_01', 'hair_short_01']
        : ['hair_short_01', 'hair_bun_01', 'hair_bob_01', 'hair_long_01']
    const weights =
      base === 'female' ? [0.34, 0.28, 0.22, 0.16] : [0.55, 0.18, 0.15, 0.12]
    const weighted = hairOptions.map((item) => {
      const rank = preferredOrder.indexOf(item.id)
      const weight = rank >= 0 ? (weights[rank] ?? 0.1) : 0.15
      return { value: item.id, weight }
    })
    hairItem = pickWeighted(weighted, rng)
  }

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
  const eyes = eyesOptions.length > 0 ? pickFrom(eyesOptions, rng).id : 'eyes_01'
  const brows = browsOptions.length > 0 ? pickFrom(browsOptions, rng).id : 'brows_01'
  const mouth = mouthOptions.length > 0 ? pickFrom(mouthOptions, rng).id : 'mouth_01'
  const eyeColor = pickFrom(catalog.colors.eyes, rng).key
  const blush = base === 'female' ? rng() < 0.35 : false

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
    fullbodyOptions.length > 0 && (topOptions.length === 0 || rng() < 0.25)

  if (wearFullbody) {
    const dress = pickFrom(fullbodyOptions, rng)
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
      const chosenTop = pickFrom(topOptions, rng)
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
      const chosenBottom = pickFrom(bottomOptions, rng)
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

  let shoes: string | null = null
  if (shoesOptions.length > 0) {
    const chosenShoes = pickFrom(shoesOptions, rng)
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
  if (glassesOptions.length > 0 && rng() < 0.28) {
    const glasses = pickFrom(glassesOptions, rng)
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
  if (neckOptions.length > 0 && base === 'female' && rng() < 0.22) {
    const neck = pickFrom(neckOptions, rng)
    accessories.neck = neck.id
    const c = buildItemColors(
      neck,
      scheme.shoesAccent,
      scheme.topSecondary,
      scheme.topPrimary,
      catalog,
      defaultFabric,
    )
    if (c) colors[neck.id] = c
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
      facialHair: null,
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
      outer: null,
      shoes,
    },
    accessories,
    colors,
    updatedAt: DEFAULT_UPDATED_AT,
    updatedBy: 'generator',
  }

  return StrictAppearanceV1Schema.parse(doc)
}

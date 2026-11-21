import colorsJson from '@/content/catalog/colors.json'
import faceAtlasJson from '@/content/catalog/face-atlas.json'
import palette3dJson from '@/content/palette3d.json'

export const BASE_BODIES = ['female', 'male'] as const
export type BaseBody = (typeof BASE_BODIES)[number]

export const CATALOG_SLOTS = [
  'hair',
  'eyes',
  'brows',
  'mouth',
  'facial_hair',
  'top',
  'bottom',
  'fullbody',
  'outer',
  'shoes',
  'head',
  'glasses',
  'ears',
  'neck',
  'wrist',
  'bag',
] as const
export type CatalogSlot = (typeof CATALOG_SLOTS)[number]

export type TintRegion = 'primary' | 'secondary' | 'accent'
export type AttachBone =
  | 'Head'
  | 'Neck'
  | 'Spine2'
  | 'LeftHand'
  | 'RightHand'
  | 'LeftForeArm'

export type CatalogBodyKey =
  | 'height'
  | 'build'
  | 'muscle'
  | 'chest'
  | 'hips'
  | 'shoulders'

export interface CatalogItem {
  id: string
  slot: CatalogSlot
  label: { vi: string; en: string }
  bases: BaseBody[]
  model: Partial<Record<BaseBody, string>> | null
  faceTile?: { atlas: 'face'; cell: [number, number] }
  thumb: string
  attach: 'skinned' | { bone: AttachBone }
  tint: {
    regions: TintRegion[]
    defaults: Partial<Record<TintRegion, string>>
  } | null
  hides: CatalogSlot[]
  requires?: CatalogSlot[]
  /** Item ids that cannot be worn together with this one (either row may list the other). */
  conflicts?: string[]
  bodyLimits?: Partial<Record<CatalogBodyKey, [number, number]>>
  tags: string[]
  credit: string
}

export interface FaceAtlasSpec {
  size: number
  grid: number
  defaults: {
    eyes: [number, number]
    brows: [number, number]
    mouth: [number, number]
  }
  eyeStates: {
    open: number
    half: number
    closed: number
    happy: number
  }
  cells: Record<string, [number, number]>
}

export interface ColorEntry {
  key: string
  label: { vi: string; en: string }
  fashion?: boolean
}

export type ColorGroup = 'skin' | 'hair' | 'eyes' | 'fabric' | 'metal' | 'lip'

export interface ColorSwatches {
  skin: ColorEntry[]
  hair: ColorEntry[]
  eyes: ColorEntry[]
  fabric: ColorEntry[]
  /** Metal and gem swatches for jewellery / hardware tints (P08a). */
  metal?: ColorEntry[]
  lip: ColorEntry[]
}

export interface PaletteSwatchEntry {
  key: string
  hex: string
  row: number
  col: number
  group: string
}

export interface Catalog {
  items: readonly CatalogItem[]
  byId: ReadonlyMap<string, CatalogItem>
  bySlot: Readonly<Record<CatalogSlot, readonly CatalogItem[]>>
  faceAtlas: FaceAtlasSpec
  colors: ColorSwatches
  colorKeys: Readonly<Record<ColorGroup, ReadonlySet<string>>>
  palette: ReadonlyMap<string, PaletteSwatchEntry>
}

export interface CatalogLoadInput {
  slotFiles?: ReadonlyArray<{ items: readonly CatalogItem[] }>
  faceAtlas?: FaceAtlasSpec
  colors?: ColorSwatches
  paletteSwatches?: readonly PaletteSwatchEntry[]
}

/**
 * Every one-slot item file in `src/content/catalog/` (`<slot>.json`), so adding a slot file or an
 * item never needs a code change. Non-slot data files (colours, atlas, presets, weights) are skipped.
 */
const SLOT_FILE_MODULES = import.meta.glob<{ items: CatalogItem[] }>(
  [
    '/src/content/catalog/*.json',
    '!/src/content/catalog/colors.json',
    '!/src/content/catalog/face-atlas.json',
    '!/src/content/catalog/generator-weights.json',
    '!/src/content/catalog/presets.json',
  ],
  { eager: true, import: 'default' },
)

const DEFAULT_SLOT_FILES: ReadonlyArray<{ items: readonly CatalogItem[] }> = Object.keys(
  SLOT_FILE_MODULES,
)
  .sort()
  .map((path) => SLOT_FILE_MODULES[path] as { items: CatalogItem[] })

/** Build an indexed wardrobe catalog from JSON data (defaults to bundled seed catalog). */
export function loadCatalog(input?: CatalogLoadInput): Catalog {
  const slotFiles = input?.slotFiles ?? DEFAULT_SLOT_FILES
  const faceAtlas =
    input?.faceAtlas ?? (faceAtlasJson as unknown as FaceAtlasSpec)
  const colors = input?.colors ?? (colorsJson as ColorSwatches)
  const paletteSwatches =
    input?.paletteSwatches ?? (palette3dJson.swatches as PaletteSwatchEntry[])

  const items: CatalogItem[] = []
  const byId = new Map<string, CatalogItem>()
  const bySlotMut: Record<CatalogSlot, CatalogItem[]> = {
    hair: [],
    eyes: [],
    brows: [],
    mouth: [],
    facial_hair: [],
    top: [],
    bottom: [],
    fullbody: [],
    outer: [],
    shoes: [],
    head: [],
    glasses: [],
    ears: [],
    neck: [],
    wrist: [],
    bag: [],
  }

  for (const file of slotFiles) {
    for (const item of file.items) {
      items.push(item)
      byId.set(item.id, item)
      bySlotMut[item.slot].push(item)
    }
  }

  const palette = new Map<string, PaletteSwatchEntry>()
  for (const sw of paletteSwatches) {
    palette.set(sw.key, sw)
  }

  const colorKeys: Record<ColorGroup, ReadonlySet<string>> = {
    skin: new Set(colors.skin.map((c) => c.key)),
    hair: new Set(colors.hair.map((c) => c.key)),
    eyes: new Set(colors.eyes.map((c) => c.key)),
    fabric: new Set(colors.fabric.map((c) => c.key)),
    metal: new Set((colors.metal ?? []).map((c) => c.key)),
    lip: new Set(colors.lip.map((c) => c.key)),
  }

  return {
    items,
    byId,
    bySlot: bySlotMut,
    faceAtlas,
    colors,
    colorKeys,
    palette,
  }
}

export const DEFAULT_CATALOG: Catalog = loadCatalog()

/** Look up a catalog item by id. */
export function getCatalogItem(
  catalog: Catalog,
  id: string | null | undefined,
): CatalogItem | undefined {
  if (!id) return undefined
  return catalog.byId.get(id)
}

/** Whether a catalog item supports the given base body ('female' | 'male'). */
export function hasBaseSupport(item: CatalogItem, base: BaseBody): boolean {
  return item.bases.includes(base)
}

/** Return all items in a slot, optionally filtered to those supporting `base`. */
export function getSlotItems(
  catalog: Catalog,
  slot: CatalogSlot,
  base?: BaseBody,
): readonly CatalogItem[] {
  const list = catalog.bySlot[slot]
  if (!base) return list
  return list.filter((item) => hasBaseSupport(item, base))
}

/** Return the default item id for a slot (first item matching `base` if given), or null if none. */
export function getSlotDefaultId(
  catalog: Catalog,
  slot: CatalogSlot,
  base?: BaseBody,
): string | null {
  const candidates = getSlotItems(catalog, slot, base)
  return candidates[0]?.id ?? null
}

/** Look up the #RRGGBB hex string for a swatch key in `palette3d.json`, or null if unknown. */
export function getColorHex(
  catalog: Catalog,
  key: string | null | undefined,
): string | null {
  if (!key) return null
  return catalog.palette.get(key)?.hex ?? null
}

/** Check whether a swatch key is valid for a specific color group (`skin`, `hair`, `eyes`, `fabric`, `lip`). */
export function isValidColorKey(
  catalog: Catalog,
  group: ColorGroup,
  key: string | null | undefined,
): boolean {
  if (!key) return false
  return catalog.colorKeys[group].has(key)
}

/** Return the first swatch key configured for a color group. */
export function getDefaultColorKey(catalog: Catalog, group: ColorGroup): string {
  const first = catalog.colors[group]?.[0]?.key
  if (first) return first
  throw new Error(`Catalog has no colors for group "${group}"`)
}

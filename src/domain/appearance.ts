import { z } from 'zod'
import { IsoSchema, type Iso } from './primitives'

export const BODY_KEYS = [
  'height',
  'build',
  'muscle',
  'chest',
  'hips',
  'shoulders',
] as const

export const BodyKeySchema = z.enum(BODY_KEYS)
export type BodyKey = z.infer<typeof BodyKeySchema>

export const BaseBodySchema = z.enum(['female', 'male'])
export type AppearanceBase = z.infer<typeof BaseBodySchema>

export const ACCESSORY_SLOTS = [
  'head',
  'glasses',
  'ears',
  'neck',
  'wrist',
  'bag',
] as const
export const AccessorySlotSchema = z.enum(ACCESSORY_SLOTS)
export type AccessorySlot = z.infer<typeof AccessorySlotSchema>

export const TINT_REGIONS = ['primary', 'secondary', 'accent'] as const
export const TintRegionSchema = z.enum(TINT_REGIONS)
export type AppearanceTintRegion = z.infer<typeof TintRegionSchema>

export type AppearanceBody = Record<BodyKey, number>

export interface AppearanceFace {
  eyes: string
  brows: string
  mouth: string
  eyeColor: string
  facialHair: string | null
  blush: boolean
}

export interface AppearanceHair {
  item: string | null
  color: string
}

export interface AppearanceOutfit {
  top: string | null
  bottom: string | null
  fullbody: string | null
  outer: string | null
  shoes: string | null
}

export type AppearanceAccessories = Partial<Record<AccessorySlot, string>>

export type AppearanceColors = Record<
  string,
  Partial<Record<AppearanceTintRegion, string>>
>

/**
 * Canonical appearance document (data-model.md §2.11).
 */
export interface AppearanceV1 {
  v: 1
  base: AppearanceBase
  body: AppearanceBody
  skin: string
  face: AppearanceFace
  hair: AppearanceHair
  outfit: AppearanceOutfit
  accessories: AppearanceAccessories
  colors: AppearanceColors
  updatedAt: Iso
  updatedBy: string
}

const SliderSchema = z.number().min(0).max(1)

export const DEFAULT_APPEARANCE_BODY: AppearanceBody = {
  height: 0.5,
  build: 0.5,
  muscle: 0,
  chest: 0,
  hips: 0,
  shoulders: 0,
}

export const DEFAULT_APPEARANCE_FACE: AppearanceFace = {
  eyes: 'eyes_01',
  brows: 'brows_01',
  mouth: 'mouth_01',
  eyeColor: 'eye_brown',
  facialHair: null,
  blush: false,
}

export const DEFAULT_APPEARANCE_HAIR: AppearanceHair = {
  item: 'hair_short_01',
  color: 'hair_black',
}

export const DEFAULT_APPEARANCE_OUTFIT: AppearanceOutfit = {
  top: 'top_tshirt_crew_01',
  bottom: 'bottom_jeans_01',
  fullbody: null,
  outer: null,
  shoes: 'shoes_sneaker_01',
}

export const DEFAULT_UPDATED_AT: Iso = '2026-11-10T00:00:00Z'

const StrictBodySchema: z.ZodType<AppearanceBody> = z.object({
  height: SliderSchema,
  build: SliderSchema,
  muscle: SliderSchema,
  chest: SliderSchema,
  hips: SliderSchema,
  shoulders: SliderSchema,
})

const StrictFaceSchema: z.ZodType<AppearanceFace> = z.object({
  eyes: z.string().min(1),
  brows: z.string().min(1),
  mouth: z.string().min(1),
  eyeColor: z.string().min(1),
  facialHair: z.string().min(1).nullable(),
  blush: z.boolean(),
})

const StrictHairSchema: z.ZodType<AppearanceHair> = z.object({
  item: z.string().min(1).nullable(),
  color: z.string().min(1),
})

const StrictOutfitSchema: z.ZodType<AppearanceOutfit> = z.object({
  top: z.string().min(1).nullable(),
  bottom: z.string().min(1).nullable(),
  fullbody: z.string().min(1).nullable(),
  outer: z.string().min(1).nullable(),
  shoes: z.string().min(1).nullable(),
})

const StrictAccessoriesSchema: z.ZodType<AppearanceAccessories> = z.object({
  head: z.string().min(1).optional(),
  glasses: z.string().min(1).optional(),
  ears: z.string().min(1).optional(),
  neck: z.string().min(1).optional(),
  wrist: z.string().min(1).optional(),
  bag: z.string().min(1).optional(),
})

const StrictItemColorsSchema = z.object({
  primary: z.string().min(1).optional(),
  secondary: z.string().min(1).optional(),
  accent: z.string().min(1).optional(),
})

const StrictColorsSchema: z.ZodType<AppearanceColors> = z.record(
  z.string(),
  StrictItemColorsSchema,
)

/**
 * Strict AppearanceV1 schema requiring every canonical field with no defaults.
 */
export const StrictAppearanceV1Schema: z.ZodType<AppearanceV1> = z.object({
  v: z.literal(1),
  base: BaseBodySchema,
  body: StrictBodySchema,
  skin: z.string().min(1),
  face: StrictFaceSchema,
  hair: StrictHairSchema,
  outfit: StrictOutfitSchema,
  accessories: StrictAccessoriesSchema,
  colors: StrictColorsSchema,
  updatedAt: IsoSchema,
  updatedBy: z.string().min(1),
})

/**
 * AppearanceV1 schema with subfield defaults so minimal v1 event fixtures
 * (e.g. `{ v: 1, base: 'male' }`) parse cleanly into a full `AppearanceV1`.
 */
export const AppearanceV1Schema: z.ZodType<AppearanceV1> = z.object({
  v: z.literal(1),
  base: BaseBodySchema,
  body: z
    .object({
      height: SliderSchema.default(DEFAULT_APPEARANCE_BODY.height),
      build: SliderSchema.default(DEFAULT_APPEARANCE_BODY.build),
      muscle: SliderSchema.default(DEFAULT_APPEARANCE_BODY.muscle),
      chest: SliderSchema.default(DEFAULT_APPEARANCE_BODY.chest),
      hips: SliderSchema.default(DEFAULT_APPEARANCE_BODY.hips),
      shoulders: SliderSchema.default(DEFAULT_APPEARANCE_BODY.shoulders),
    })
    .default({ ...DEFAULT_APPEARANCE_BODY }),
  skin: z.string().min(1).default('skin_03'),
  face: z
    .object({
      eyes: z.string().min(1).default(DEFAULT_APPEARANCE_FACE.eyes),
      brows: z.string().min(1).default(DEFAULT_APPEARANCE_FACE.brows),
      mouth: z.string().min(1).default(DEFAULT_APPEARANCE_FACE.mouth),
      eyeColor: z.string().min(1).default(DEFAULT_APPEARANCE_FACE.eyeColor),
      facialHair: z.string().min(1).nullable().default(null),
      blush: z.boolean().default(false),
    })
    .default({ ...DEFAULT_APPEARANCE_FACE }),
  hair: z
    .object({
      item: z.string().min(1).nullable().default(DEFAULT_APPEARANCE_HAIR.item),
      color: z.string().min(1).default(DEFAULT_APPEARANCE_HAIR.color),
    })
    .default({ ...DEFAULT_APPEARANCE_HAIR }),
  outfit: z
    .object({
      top: z.string().min(1).nullable().default(DEFAULT_APPEARANCE_OUTFIT.top),
      bottom: z.string().min(1).nullable().default(DEFAULT_APPEARANCE_OUTFIT.bottom),
      fullbody: z.string().min(1).nullable().default(null),
      outer: z.string().min(1).nullable().default(null),
      shoes: z.string().min(1).nullable().default(DEFAULT_APPEARANCE_OUTFIT.shoes),
    })
    .default({ ...DEFAULT_APPEARANCE_OUTFIT }),
  accessories: StrictAccessoriesSchema.default({}),
  colors: StrictColorsSchema.default({}),
  updatedAt: IsoSchema.default(DEFAULT_UPDATED_AT),
  updatedBy: z.string().min(1).default('generator'),
})

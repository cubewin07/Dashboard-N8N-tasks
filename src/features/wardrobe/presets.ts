import { z } from 'zod'
import presetsJson from '@/content/catalog/presets.json'
import { CATALOG_SLOTS } from '@/scene/characters/catalog'

const SlotKey = z.enum(CATALOG_SLOTS)

/** What one preset wants in one slot: items carrying any of `tagsAny`, else `fallback`. */
export const PresetPickSchema = z.object({
  tagsAny: z.array(z.string().min(1)),
  /** Item id used when no tagged item fits the body base; null = leave the slot empty. */
  fallback: z.string().min(1).nullable(),
  /** Chance (0..1) that an optional slot gets filled; omitted = always. */
  chance: z.number().min(0).max(1).optional(),
})
export type PresetPick = z.infer<typeof PresetPickSchema>

export const PresetSchema = z.object({
  key: z.string().min(1),
  label: z.object({ vi: z.string().min(1), en: z.string().min(1) }),
  picks: z.partialRecord(SlotKey, PresetPickSchema),
  /** Swatch keys offered to each tint region of the picked items. */
  colours: z
    .object({
      primary: z.array(z.string().min(1)).optional(),
      secondary: z.array(z.string().min(1)).optional(),
      accent: z.array(z.string().min(1)).optional(),
    })
    .optional(),
})
export type Preset = z.infer<typeof PresetSchema>

export const PresetsFileSchema = z.object({ presets: z.array(PresetSchema).min(1) })

/** Presets from `src/content/catalog/presets.json` (validated at load). */
export const PRESETS: readonly Preset[] = PresetsFileSchema.parse(presetsJson).presets

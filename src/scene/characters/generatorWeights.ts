import { z } from 'zod'
import type { AppearanceBase } from '@/domain/appearance'
import weightsJson from '@/content/catalog/generator-weights.json'
import type { CatalogItem } from './catalog'

const PerBase = z.object({ female: z.number().min(0).max(1), male: z.number().min(0).max(1) })

export const GeneratorWeightsSchema = z.object({
  tagMultipliers: z.record(z.string(), z.number().min(0)),
  items: z.object({
    female: z.record(z.string(), z.number().min(0)),
    male: z.record(z.string(), z.number().min(0)),
  }),
  slotChance: z.record(z.string(), z.union([z.number().min(0).max(1), PerBase])),
})

export type GeneratorWeights = z.infer<typeof GeneratorWeightsSchema>

/** Seeded-look weights from `src/content/catalog/generator-weights.json` (validated at load). */
export const DEFAULT_GENERATOR_WEIGHTS: GeneratorWeights = GeneratorWeightsSchema.parse(weightsJson)

/** Relative pick weight of a catalogue item for a base: tag multipliers x per-item override. */
export function itemWeight(weights: GeneratorWeights, item: CatalogItem, base: AppearanceBase): number {
  let w = weights.items[base][item.id] ?? 1
  for (const tag of item.tags) w *= weights.tagMultipliers[tag] ?? 1
  return w
}

/** Probability that an optional slot is worn (0 when the slot is not listed). */
export function slotChance(weights: GeneratorWeights, slot: string, base: AppearanceBase): number {
  const c = weights.slotChance[slot]
  if (c === undefined) return 0
  return typeof c === 'number' ? c : c[base]
}

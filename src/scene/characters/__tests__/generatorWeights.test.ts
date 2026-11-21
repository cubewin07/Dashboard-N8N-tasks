import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOG, getCatalogItem, getSlotItems } from '../catalog'
import { generateAppearance } from '../generate'
import {
  DEFAULT_GENERATOR_WEIGHTS,
  GeneratorWeightsSchema,
  itemWeight,
  slotChance,
  type GeneratorWeights,
} from '../generatorWeights'

const ids = Array.from({ length: 120 }, (_, i) => `emp_weights_${i}`)

function withWeights(patch: Partial<GeneratorWeights>): GeneratorWeights {
  return GeneratorWeightsSchema.parse({ ...DEFAULT_GENERATOR_WEIGHTS, ...patch })
}

describe('generator weights (P08a-T13)', () => {
  it('loads generator-weights.json and every listed item id exists', () => {
    for (const base of ['female', 'male'] as const) {
      for (const id of Object.keys(DEFAULT_GENERATOR_WEIGHTS.items[base])) {
        expect(getCatalogItem(DEFAULT_CATALOG, id), id).toBeDefined()
      }
    }
  })

  it('multiplies tag multipliers and the per-base item override', () => {
    const w = withWeights({
      tagMultipliers: { office: 3, casual: 0.5 },
      items: { female: { top_shirt_office_01: 2 }, male: {} },
    })
    const shirt = getCatalogItem(DEFAULT_CATALOG, 'top_shirt_office_01')
    expect(shirt).toBeDefined()
    const tagProduct = shirt!.tags.reduce((p, t) => p * (w.tagMultipliers[t] ?? 1), 1)
    expect(itemWeight(w, shirt!, 'female')).toBeCloseTo(2 * tagProduct)
    expect(itemWeight(w, shirt!, 'male')).toBeCloseTo(tagProduct)
  })

  it('never picks an item whose weight is 0 while others remain', () => {
    const tops = getSlotItems(DEFAULT_CATALOG, 'top', 'female')
    const banned = tops[0]!.id
    const w = withWeights({
      items: { female: { [banned]: 0 }, male: { [banned]: 0 } },
      slotChance: { ...DEFAULT_GENERATOR_WEIGHTS.slotChance, fullbody: 0 },
    })
    for (const id of ids) {
      expect(generateAppearance(id, DEFAULT_CATALOG, { weights: w }).outfit.top).not.toBe(banned)
    }
  })

  it('respects slot chances: 0 never wears, 1 always wears when items exist', () => {
    const off = withWeights({ slotChance: { glasses: 0, neck: 0, fullbody: 0 } })
    const on = withWeights({ slotChance: { glasses: 1, fullbody: 0 } })
    expect(slotChance(off, 'glasses', 'female')).toBe(0)
    expect(slotChance(off, 'unknown_slot', 'male')).toBe(0)
    for (const id of ids.slice(0, 30)) {
      const a = generateAppearance(id, DEFAULT_CATALOG, { weights: off })
      expect(a.accessories.glasses).toBeUndefined()
      expect(a.accessories.neck).toBeUndefined()
      expect(a.outfit.fullbody).toBeNull()
      const b = generateAppearance(id, DEFAULT_CATALOG, { weights: on })
      expect(b.accessories.glasses).toBeDefined()
    }
  })

  it('only adds an outer layer over a top or a fullbody', () => {
    const w = withWeights({ slotChance: { ...DEFAULT_GENERATOR_WEIGHTS.slotChance, outer: 1 } })
    for (const id of ids) {
      const a = generateAppearance(id, DEFAULT_CATALOG, { weights: w })
      if (a.outfit.outer) expect(a.outfit.top ?? a.outfit.fullbody).not.toBeNull()
    }
  })
})

describe('retired items', () => {
  it('never appear in seeded looks', () => {
    const hair = DEFAULT_CATALOG.bySlot.hair
    const retiredId = hair[0].id
    const catalog = {
      ...DEFAULT_CATALOG,
      bySlot: { ...DEFAULT_CATALOG.bySlot, hair: hair.map((h, i) => (i === 0 ? { ...h, retired: true } : h)) },
    }
    for (let i = 0; i < 200; i++) {
      expect(generateAppearance(`retired-${i}`, catalog).hair.item).not.toBe(retiredId)
    }
  })
})

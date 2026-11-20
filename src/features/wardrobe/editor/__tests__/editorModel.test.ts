import { describe, expect, it } from 'vitest'
import { generateAppearance } from '@/scene/characters/generate'
import { DEFAULT_CATALOG, loadCatalog, type CatalogItem } from '@/scene/characters/catalog'
import { buildTabs, limitingItemFor, sliderRange, slotTags, switchBase } from '../editorModel'
import { getSlotItemId } from '../../logic'

describe('buildTabs', () => {
  it('lists the nine tabs in order and groups face / accessory slots', () => {
    const tabs = buildTabs()
    expect(tabs.map((t) => t.key)).toEqual([
      'body', 'face', 'hair', 'top', 'bottom', 'fullbody', 'outer', 'shoes', 'accessories',
    ])
    expect(tabs.find((t) => t.key === 'face')!.slots).toEqual(['eyes', 'brows', 'mouth', 'facial_hair'])
    expect(tabs.find((t) => t.key === 'accessories')!.slots).toEqual([
      'head', 'glasses', 'ears', 'neck', 'wrist', 'bag',
    ])
  })
  it('collects tags without retired items', () => {
    const items = DEFAULT_CATALOG.bySlot.top
    expect(slotTags(items)).toContain('casual')
  })
})

const fitted: CatalogItem = {
  id: 'top_vest_t',
  slot: 'top',
  label: { vi: 'Áo vest', en: 'Vest' },
  bases: ['female', 'male'],
  model: null,
  thumb: 'thumbs/x.webp',
  attach: 'skinned',
  tint: null,
  hides: [],
  bodyLimits: { build: [0.2, 0.6] },
  tags: ['office'],
  credit: 'test',
}

function limitedCatalog() {
  const slots = [
    // No fullbody either, so the seeded look has to wear the fitted top.
    { items: DEFAULT_CATALOG.items.filter((i) => i.slot !== 'top' && i.slot !== 'fullbody' && !i.bodyLimits) },
    { items: [fitted] },
  ]
  return loadCatalog({ slotFiles: slots })
}

describe('slider limits', () => {
  it('narrows the range and names the limiting item when a fitted item is worn', () => {
    const catalog = limitedCatalog()
    const doc = generateAppearance('emp_a', catalog)
    expect(getSlotItemId(doc, 'top')).toBe('top_vest_t')
    expect(sliderRange(doc, 'build', catalog)).toEqual([0.2, 0.6])
    expect(sliderRange(doc, 'height', catalog)).toEqual([0, 1])
    expect(limitingItemFor(doc, 'build', catalog)?.id).toBe('top_vest_t')
    expect(limitingItemFor(doc, 'height', catalog)).toBeNull()
  })
})

describe('switchBase', () => {
  it('keeps a valid doc and flips the base', () => {
    const doc = generateAppearance('emp_b')
    const other = doc.base === 'female' ? 'male' : 'female'
    const next = switchBase(doc, other)
    expect(next.base).toBe(other)
    expect(switchBase(next, other)).toBe(next)
  })
})

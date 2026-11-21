import { describe, expect, it } from 'vitest'
import type { AppearanceV1 } from '@/domain/appearance'
import {
  DEFAULT_CATALOG,
  loadCatalog,
  type CatalogItem,
} from '@/scene/characters/catalog'
import { generateAppearance } from '@/scene/characters/generate'
import {
  applyClamps,
  applyItem,
  applyPreset,
  bodyClamps,
  diffLooks,
  getSlotItemId,
  randomise,
  setBodySlider,
  type LockKey,
} from '../logic'
import { PRESETS, PresetsFileSchema } from '../presets'
import presetsJson from '@/content/catalog/presets.json'

function item(partial: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'slot'>): CatalogItem {
  return {
    label: { vi: partial.id, en: partial.id },
    bases: ['female', 'male'],
    model: null,
    thumb: `thumbs/${partial.id}.webp`,
    attach: 'skinned',
    tint: null,
    hides: [],
    tags: [],
    credit: 'test',
    ...partial,
  }
}

const EXTRA: CatalogItem[] = [
  item({ id: 'x_dress', slot: 'fullbody', hides: ['top', 'bottom'], tags: ['tet'], bases: ['female'] }),
  item({ id: 'x_dress_tight', slot: 'fullbody', hides: ['top', 'bottom'], bases: ['female'], bodyLimits: { build: [0, 0.4] } }),
  item({ id: 'x_blazer', slot: 'outer', requires: ['top', 'fullbody'], tags: ['office'], bodyLimits: { chest: [0, 0.5] } }),
  item({ id: 'x_cap', slot: 'head', tags: ['sport'], conflicts: ['x_beanie'] }),
  item({ id: 'x_beanie', slot: 'head', tags: ['casual'] }),
  item({ id: 'x_glasses_b', slot: 'glasses', conflicts: ['glasses_round_01'] }),
  item({ id: 'x_old_top', slot: 'top', retired: true }),
]
const CATALOG = loadCatalog({
  slotFiles: [{ items: [...DEFAULT_CATALOG.items, ...EXTRA] }],
})

function base(over: Partial<AppearanceV1> = {}): AppearanceV1 {
  let doc = generateAppearance('emp_linh', CATALOG)
  doc = {
    ...doc,
    base: 'female',
    outfit: { top: 'top_tshirt_crew_01', bottom: 'bottom_jeans_01', fullbody: null, outer: null, shoes: 'shoes_sneaker_01' },
    accessories: {},
    body: { height: 0.5, build: 0.5, muscle: 0.2, chest: 0.3, hips: 0.3, shoulders: 0.3 },
    ...over,
  }
  return doc
}

describe('applyItem', () => {
  it('fullbody hides top/bottom and restores them when removed', () => {
    const d0 = base()
    const on = applyItem(d0, 'fullbody', 'x_dress', CATALOG)
    expect(on.doc.outfit.fullbody).toBe('x_dress')
    // hidden picks are kept
    expect(on.doc.outfit.top).toBe('top_tshirt_crew_01')
    expect(on.doc.outfit.bottom).toBe('bottom_jeans_01')
    const off = applyItem(on.doc, 'fullbody', null, CATALOG)
    expect(off.doc.outfit.fullbody).toBeNull()
    expect(off.doc.outfit.top).toBe('top_tshirt_crew_01')
    expect(off.doc.outfit.bottom).toBe('bottom_jeans_01')
  })

  it('brings back the default top/bottom when nothing was kept', () => {
    const dressed = base({ outfit: { top: null, bottom: null, fullbody: 'x_dress', outer: null, shoes: 'shoes_sneaker_01' } })
    const off = applyItem(dressed, 'fullbody', null, CATALOG)
    expect(off.doc.outfit.top).not.toBeNull()
    expect(off.doc.outfit.bottom).not.toBeNull()
    expect(off.restored.map((r) => r.slot).sort()).toEqual(['bottom', 'top'])
  })

  it('picking a top while wearing a dress takes the dress off', () => {
    const dressed = applyItem(base(), 'fullbody', 'x_dress', CATALOG).doc
    const r = applyItem(dressed, 'top', 'top_hoodie_01', CATALOG)
    expect(r.doc.outfit.fullbody).toBeNull()
    expect(r.doc.outfit.top).toBe('top_hoodie_01')
    expect(r.removed).toEqual([{ slot: 'fullbody', itemId: 'x_dress', reason: 'hides' }])
  })

  it('outer requires a top or fullbody: removing the support removes the outer', () => {
    const withOuter = applyItem(base(), 'outer', 'x_blazer', CATALOG)
    expect(withOuter.doc.outfit.outer).toBe('x_blazer')
    // over a dress it stays
    const dress = applyItem(withOuter.doc, 'fullbody', 'x_dress', CATALOG)
    expect(dress.doc.outfit.outer).toBe('x_blazer')
    // top can not be emptied while visible
    expect(applyItem(withOuter.doc, 'top', null, CATALOG).refused).toBe('required')
  })

  it('outer with nothing under it auto-adds a default top', () => {
    const bare = base({ outfit: { top: null, bottom: 'bottom_jeans_01', fullbody: null, outer: null, shoes: 'shoes_sneaker_01' } })
    const r = applyItem(bare, 'outer', 'x_blazer', CATALOG)
    expect(r.doc.outfit.outer).toBe('x_blazer')
    expect(r.doc.outfit.top).not.toBeNull()
    expect(r.restored[0]?.slot).toBe('top')
  })

  it('conflicts are resolved in both directions', () => {
    const a = applyItem(base(), 'head', 'x_beanie', CATALOG).doc
    const b = applyItem(a, 'head', 'x_cap', CATALOG)
    expect(b.doc.accessories.head).toBe('x_cap')
    const g = applyItem(base({ accessories: { glasses: 'glasses_round_01' } }), 'glasses', 'x_glasses_b', CATALOG)
    expect(g.doc.accessories.glasses).toBe('x_glasses_b')
  })

  it('shipped outer/fullbody conflicts (P08a-T10): the last one put on wins, both ways', () => {
    const dressed = applyItem(base(), 'fullbody', 'fullbody_dress_office_01', DEFAULT_CATALOG).doc
    const withCardigan = applyItem(dressed, 'outer', 'outer_cardigan_01', DEFAULT_CATALOG)
    expect(withCardigan.doc.outfit.outer).toBe('outer_cardigan_01')
    expect(withCardigan.doc.outfit.fullbody).toBeNull()
    expect(withCardigan.removed).toContainEqual({ slot: 'fullbody', itemId: 'fullbody_dress_office_01', reason: 'conflict' })
    expect(withCardigan.doc.outfit.top).not.toBeNull()

    const backInDress = applyItem(withCardigan.doc, 'fullbody', 'fullbody_dress_office_01', DEFAULT_CATALOG)
    expect(backInDress.doc.outfit.fullbody).toBe('fullbody_dress_office_01')
    expect(backInDress.doc.outfit.outer).toBeNull()
  })

  it('refuses unknown, wrong-base and retired items', () => {
    expect(applyItem(base(), 'top', 'nope', CATALOG).refused).toBe('unknown_item')
    expect(applyItem(base(), 'bottom', 'top_hoodie_01', CATALOG).refused).toBe('unknown_item')
    const male = base({ base: 'male' })
    expect(applyItem(male, 'fullbody', 'x_dress', CATALOG).refused).toBe('unsupported_base')
    expect(applyItem(base(), 'top', 'x_old_top', CATALOG).refused).toBe('retired')
  })

  it('does not mutate the input', () => {
    const d0 = base()
    const snap = JSON.stringify(d0)
    applyItem(d0, 'fullbody', 'x_dress', CATALOG)
    expect(JSON.stringify(d0)).toBe(snap)
  })

  it('reports a limit clamp decision and leaves the body untouched until confirmed', () => {
    const d0 = base({ body: { ...base().body, build: 0.8 } })
    const r = applyItem(d0, 'fullbody', 'x_dress_tight', CATALOG)
    expect(r.clamps).toEqual([{ slider: 'build', from: 0.8, to: 0.4, item: 'x_dress_tight' }])
    expect(r.doc.body.build).toBe(0.8)
    const clamped = applyClamps(r.doc, r.clamps)
    expect(clamped.body.build).toBe(0.4)
    expect(bodyClamps(clamped, CATALOG)).toEqual([])
  })

  it('no clamps when the body already fits', () => {
    const slim = base({ body: { ...base().body, build: 0.3 } })
    const r = applyItem(slim, 'fullbody', 'x_dress_tight', CATALOG)
    expect(r.clamps).toEqual([])
  })

  it('hidden items do not limit the body', () => {
    // top has no limits here, but a hidden outer-limited item must not count
    const d = base({ body: { ...base().body, chest: 0.9 } })
    const r = applyItem(d, 'outer', 'x_blazer', CATALOG)
    expect(r.clamps[0]).toMatchObject({ slider: 'chest', item: 'x_blazer' })
  })

  it('setBodySlider stays inside the limits', () => {
    const d = applyItem(base(), 'fullbody', 'x_dress_tight', CATALOG).doc
    expect(setBodySlider(d, 'build', 0.9, CATALOG).body.build).toBe(0.4)
    expect(setBodySlider(d, 'height', 2, CATALOG).body.height).toBe(1)
  })
})

describe('randomise', () => {
  it('is seeded: same seed same look, other seeds vary', () => {
    const d = base()
    const a = randomise(d, CATALOG, new Set(), 'seed-1')
    const b = randomise(d, CATALOG, new Set(), 'seed-1')
    expect(b).toEqual(a)
    const others = new Set(
      ['s2', 's3', 's4', 's5'].map((s) => JSON.stringify(randomise(d, CATALOG, new Set(), s))),
    )
    expect(others.size).toBeGreaterThan(1)
  })

  it('keeps locked slots, skin and body and the base', () => {
    const d = base()
    const locks = new Set<LockKey>(['hair', 'top', 'skin', 'body', 'shoes'])
    for (let i = 0; i < 12; i += 1) {
      const r = randomise(d, CATALOG, locks, i)
      expect(r.base).toBe(d.base)
      expect(r.hair).toEqual(d.hair)
      expect(r.outfit.top).toBe(d.outfit.top)
      expect(r.outfit.shoes).toBe(d.outfit.shoes)
      expect(r.skin).toBe(d.skin)
      expect(r.body).toEqual(d.body)
    }
  })

  it('produces consistent looks (required slots filled, hidden slots respected)', () => {
    for (let i = 0; i < 30; i += 1) {
      const r = randomise(base(), CATALOG, new Set(), i)
      expect(bodyClamps(r, CATALOG)).toEqual([])
      if (!r.outfit.fullbody) {
        expect(r.outfit.top).not.toBeNull()
        expect(r.outfit.bottom).not.toBeNull()
      }
      if (r.outfit.outer) expect(r.outfit.top || r.outfit.fullbody).toBeTruthy()
    }
  })

  it('changes something when nothing is locked', () => {
    const d = base()
    const results = [1, 2, 3].map((s) => randomise(d, CATALOG, new Set(), s))
    expect(results.some((r) => !diffLooks(d, r, CATALOG).same)).toBe(true)
  })
})

describe('presets', () => {
  it('presets.json is valid, has the four required presets and only known ids/tags', () => {
    expect(PresetsFileSchema.safeParse(presetsJson).success).toBe(true)
    expect(PRESETS.map((p) => p.label.vi)).toEqual(['Công sở', 'Dạo phố', 'Áo dài Tết', 'Thể thao'])
    for (const p of PRESETS) {
      for (const [slot, pick] of Object.entries(p.picks)) {
        if (!pick.fallback) continue
        const it = DEFAULT_CATALOG.byId.get(pick.fallback)
        expect(it?.slot, `${p.key}.${slot} fallback`).toBe(slot)
      }
      for (const keys of Object.values(p.colours ?? {})) {
        for (const k of keys ?? []) expect(DEFAULT_CATALOG.palette.has(k), k).toBe(true)
      }
    }
  })

  it('is seeded and picks by tag with fallback', () => {
    const sport = PRESETS.find((p) => p.key === 'sport')!
    const a = applyPreset(base(), sport, CATALOG, 7)
    const b = applyPreset(base(), sport, CATALOG, 7)
    expect(b.doc).toEqual(a.doc)
    const tagsOf = (id: string | null) => (id ? CATALOG.byId.get(id)?.tags ?? [] : [])
    expect(tagsOf(a.doc.outfit.bottom)).toContain('sport')
    expect(a.doc.outfit.shoes).not.toBeNull()
    expect(a.refused).toBeUndefined()
  })

  it('tet preset wears the dress on female (tagged item) and separates on male', () => {
    const tet = PRESETS.find((p) => p.key === 'tet')!
    const f = applyPreset(base(), tet, CATALOG, 1)
    expect(f.doc.outfit.fullbody).toBe('x_dress')
    // Male: x_dress is female-only, so the pick is a male-capable tet item or the separates fallback.
    const m = applyPreset(base({ base: 'male', hair: { item: 'hair_short_01', color: 'hair_black' } }), tet, CATALOG, 1)
    const fb = m.doc.outfit.fullbody ? CATALOG.byId.get(m.doc.outfit.fullbody)! : null
    if (fb) {
      expect(fb.bases).toContain('male')
      expect(fb.tags.some((t) => ['tet', 'aodai', 'traditional'].includes(t))).toBe(true)
    } else expect(m.doc.outfit.top).not.toBeNull()
  })

  it('office preset gives an office look and applies its colour palette', () => {
    const office = PRESETS.find((p) => p.key === 'office')!
    const r = applyPreset(base(), office, CATALOG, 3)
    const officeish = (id: string | null) =>
      (id ? CATALOG.byId.get(id)?.tags ?? [] : []).some((t) => t === 'office' || t === 'formal')
    expect(officeish(r.doc.outfit.top)).toBe(true)
    expect(officeish(r.doc.outfit.bottom)).toBe(true)
    expect(officeish(r.doc.outfit.shoes)).toBe(true)
    const top = CATALOG.byId.get(r.doc.outfit.top!)!
    if (top.tint?.regions.includes('primary')) expect(office.colours?.primary).toContain(r.doc.colors[top.id]?.primary)
    expect(r.doc.outfit.outer === null || r.doc.outfit.outer === 'x_blazer').toBe(true)
  })

  it('works on the real catalogue too', () => {
    for (const p of PRESETS) {
      const r = applyPreset(generateAppearance('emp_x'), p, DEFAULT_CATALOG, 'a')
      expect(r.doc.outfit.shoes).not.toBeNull()
    }
  })
})

describe('diffLooks', () => {
  it('reports what differs and ignores updatedAt/updatedBy', () => {
    const a = base()
    expect(diffLooks(a, { ...a, updatedAt: '2030-01-01T00:00:00Z', updatedBy: 'x' }, CATALOG).same).toBe(true)
    const b = applyItem(a, 'fullbody', 'x_dress', CATALOG).doc
    const d = diffLooks(a, { ...b, skin: 'skin_09', body: { ...b.body, height: 0.9 } }, CATALOG)
    expect(d.slots).toEqual(['fullbody'])
    expect(d.skin).toBe(true)
    expect(d.body).toEqual(['height'])
    expect(d.same).toBe(false)
    expect(getSlotItemId(b, 'fullbody')).toBe('x_dress')
  })
})

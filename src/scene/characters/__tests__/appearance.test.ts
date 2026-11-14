import { describe, expect, it, vi } from 'vitest'
import {
  AppearanceV1Schema,
  StrictAppearanceV1Schema,
  type AppearanceV1,
} from '@/domain/appearance'
import { hashAppearance, migrateAppearance } from '../appearance'
import { DEFAULT_CATALOG } from '../catalog'

function makeValidDoc(): AppearanceV1 {
  return {
    v: 1,
    base: 'female',
    body: {
      height: 0.55,
      build: 0.4,
      muscle: 0.2,
      chest: 0.35,
      hips: 0.45,
      shoulders: 0.3,
    },
    skin: 'skin_02',
    face: {
      eyes: 'eyes_02',
      brows: 'brows_01',
      mouth: 'mouth_03',
      eyeColor: 'eye_dark',
      facialHair: null,
      blush: true,
    },
    hair: {
      item: 'hair_bob_01',
      color: 'hair_brown_dark',
    },
    outfit: {
      top: 'top_shirt_office_01',
      bottom: 'bottom_trousers_01',
      fullbody: null,
      outer: null,
      shoes: 'shoes_loafer_01',
    },
    accessories: {
      glasses: 'glasses_round_01',
      neck: 'neck_necklace_01',
    },
    colors: {
      top_shirt_office_01: { primary: 'c_sky', secondary: 'c_white' },
      bottom_trousers_01: { primary: 'c_charcoal' },
      shoes_loafer_01: { primary: 'c_brown' },
      glasses_round_01: { primary: 'c_black' },
    },
    updatedAt: '2026-11-10T08:00:00Z',
    updatedBy: 'stylist_01',
  }
}

describe('appearance schema, migration, and hashing (R10)', () => {
  it('accepts a valid AppearanceV1 without warnings', () => {
    const warn = vi.fn()
    const doc = makeValidDoc()
    const migrated = migrateAppearance(doc, DEFAULT_CATALOG, warn)

    expect(migrated).toEqual(doc)
    expect(warn).not.toHaveBeenCalled()
    expect(StrictAppearanceV1Schema.safeParse(migrated).success).toBe(true)
  })

  it('parses minimal v1 appearance objects via AppearanceV1Schema defaults', () => {
    const parsed = AppearanceV1Schema.parse({ v: 1, base: 'male' })
    expect(parsed.v).toBe(1)
    expect(parsed.base).toBe('male')
    expect(StrictAppearanceV1Schema.safeParse(parsed).success).toBe(true)
  })

  it('falls back unknown item ids and colours to slot defaults with exactly one warning', () => {
    const warn = vi.fn()
    const input = {
      ...makeValidDoc(),
      skin: 'skin_alien_99',
      hair: { item: 'hair_removed_99', color: 'hair_neon_99' },
      face: {
        eyes: 'eyes_removed',
        brows: 'brows_removed',
        mouth: 'mouth_removed',
        eyeColor: 'eye_laser',
        facialHair: 'beard_removed',
        blush: false,
      },
      outfit: {
        top: 'top_removed_99',
        bottom: 'bottom_removed_99',
        fullbody: null,
        outer: 'outer_removed',
        shoes: 'shoes_removed_99',
      },
      accessories: {
        glasses: 'glasses_removed',
      },
      colors: {
        top_shirt_office_01: { primary: 'c_missing_swatch' },
        removed_item: { primary: 'c_white' },
      },
    }

    const migrated = migrateAppearance(input, DEFAULT_CATALOG, warn)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(StrictAppearanceV1Schema.safeParse(migrated).success).toBe(true)
    expect(migrated.skin).toBe('skin_03')
    expect(migrated.hair.item).toBe('hair_short_01')
    expect(migrated.hair.color).toBe('hair_black')
    expect(migrated.face.eyes).toBe('eyes_01')
    expect(migrated.face.brows).toBe('brows_01')
    expect(migrated.face.mouth).toBe('mouth_01')
    expect(migrated.face.eyeColor).toBe('eye_brown')
    expect(migrated.face.facialHair).toBeNull()
    expect(migrated.outfit.top).toBe('top_tshirt_crew_01')
    expect(migrated.outfit.bottom).toBe('bottom_jeans_01')
    expect(migrated.outfit.outer).toBeNull()
    expect(migrated.outfit.shoes).toBe('shoes_sneaker_01')
    expect(migrated.accessories.glasses).toBeUndefined()
    expect(migrated.colors.removed_item).toBeUndefined()
    expect(migrated.colors.top_shirt_office_01?.primary).toBe('c_sky')
  })

  it('defaults warn to console.warn when omitted', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const migrated = migrateAppearance({
        v: 1,
        base: 'male',
        outfit: { top: 'top_missing' },
      })
      expect(migrated.outfit.top).toBe('top_tshirt_crew_01')
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('falls back base-incompatible items (e.g. female-only dress on male)', () => {
    const warn = vi.fn()
    const migrated = migrateAppearance(
      {
        v: 1,
        base: 'male',
        outfit: {
          fullbody: 'fullbody_dress_simple_01',
          top: null,
          bottom: null,
          shoes: 'shoes_loafer_01',
        },
      },
      DEFAULT_CATALOG,
      warn,
    )

    expect(warn).toHaveBeenCalledTimes(1)
    expect(migrated.outfit.fullbody).toBeNull()
    expect(migrated.outfit.top).toBe('top_tshirt_crew_01')
    expect(migrated.outfit.bottom).toBe('bottom_jeans_01')
  })

  it('migrates v0 legacy fixtures with aliases and out-of-range sliders into valid v1', () => {
    const warn = vi.fn()
    const v0Fixture = {
      v: 0,
      base: 'female',
      body: {
        height: 1.8,
        build: -0.25,
        muscle: 0.4,
        chest: 0.5,
        hips: 2.0,
        shoulders: -1,
      },
      skin: 'skin_04',
      hair: { id: 'hair_long_01', color: 'hair_chestnut' },
      face: {
        eyes: 'eyes_03',
        brows: 'brows_02',
        mouth: 'mouth_02',
        eyeColor: 'eye_hazel',
        blush: true,
      },
      outfit: {
        fullbody: 'fullbody_dress_simple_01',
        top: null,
        bottom: null,
        shoes: 'shoes_loafer_01',
      },
      accessories: {
        glasses: 'glasses_round_01',
        neck: 'neck_necklace_01',
        hairAcc: null,
        earrings: null,
        watch: null,
        back: null,
      },
      colors: {
        fullbody_dress_simple_01: { primary: 'c_jade' },
      },
    }

    const migrated = migrateAppearance(v0Fixture, DEFAULT_CATALOG, warn)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(StrictAppearanceV1Schema.safeParse(migrated).success).toBe(true)
    expect(migrated.v).toBe(1)
    expect(migrated.hair).toEqual({ item: 'hair_long_01', color: 'hair_chestnut' })
    expect(migrated.body.height).toBe(1)
    expect(migrated.body.build).toBe(0)
    expect(migrated.body.hips).toBe(1)
    expect(migrated.body.shoulders).toBe(0)
    expect(migrated.outfit.fullbody).toBe('fullbody_dress_simple_01')
    expect(migrated.outfit.top).toBeNull()
    expect(migrated.outfit.bottom).toBeNull()
    expect(migrated.accessories).toEqual({
      glasses: 'glasses_round_01',
      neck: 'neck_necklace_01',
    })
  })

  it.each([
    null,
    undefined,
    'invalid',
    42,
    [],
    { v: 99, base: 'alien', body: { height: Number.NaN }, hair: 'bad', outfit: 123 },
  ])('always returns a valid AppearanceV1 for malformed input %j', (malformed) => {
    const warn = vi.fn()
    const migrated = migrateAppearance(malformed, DEFAULT_CATALOG, warn)
    expect(StrictAppearanceV1Schema.safeParse(migrated).success).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('produces identical hashAppearance digests regardless of key insertion order', () => {
    const a = makeValidDoc()
    const b: AppearanceV1 = {
      updatedBy: a.updatedBy,
      updatedAt: a.updatedAt,
      colors: {
        glasses_round_01: { primary: 'c_black' },
        shoes_loafer_01: { primary: 'c_brown' },
        bottom_trousers_01: { primary: 'c_charcoal' },
        top_shirt_office_01: { secondary: 'c_white', primary: 'c_sky' },
      },
      accessories: {
        neck: 'neck_necklace_01',
        glasses: 'glasses_round_01',
      },
      outfit: {
        shoes: 'shoes_loafer_01',
        outer: null,
        fullbody: null,
        bottom: 'bottom_trousers_01',
        top: 'top_shirt_office_01',
      },
      hair: {
        color: 'hair_brown_dark',
        item: 'hair_bob_01',
      },
      face: {
        blush: true,
        facialHair: null,
        eyeColor: 'eye_dark',
        mouth: 'mouth_03',
        brows: 'brows_01',
        eyes: 'eyes_02',
      },
      skin: 'skin_02',
      body: {
        shoulders: 0.3,
        hips: 0.45,
        chest: 0.35,
        muscle: 0.2,
        build: 0.4,
        height: 0.55,
      },
      base: 'female',
      v: 1,
    }

    expect(hashAppearance(a)).toBe(hashAppearance(b))

    const modified: AppearanceV1 = {
      ...a,
      hair: { ...a.hair, color: 'hair_blonde' },
    }
    expect(hashAppearance(a)).not.toBe(hashAppearance(modified))
  })
})

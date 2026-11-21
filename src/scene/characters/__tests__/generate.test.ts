import { describe, expect, it } from 'vitest'
import orgSeed from '@/content/org.seed.json'
import { StrictAppearanceV1Schema, type AppearanceV1 } from '@/domain/appearance'
import { hashAppearance } from '../appearance'
import {
  DEFAULT_CATALOG,
  getCatalogItem,
  hasBaseSupport,
  isValidColorKey,
} from '../catalog'
import { generateAppearance } from '../generate'

function outfitSignature(doc: AppearanceV1): string {
  const hair = `${doc.hair.item ?? 'none'}:${doc.hair.color}`
  const upperId = doc.outfit.fullbody ?? doc.outfit.top ?? 'none'
  const upperColor = upperId !== 'none' ? (doc.colors[upperId]?.primary ?? 'default') : 'none'
  const bottomId = doc.outfit.fullbody ? 'hidden' : (doc.outfit.bottom ?? 'none')
  const bottomColor =
    bottomId !== 'none' && bottomId !== 'hidden'
      ? (doc.colors[bottomId]?.primary ?? 'default')
      : 'none'
  return `${hair}|${upperId}:${upperColor}|${bottomId}:${bottomColor}`
}

describe('generateAppearance (R9)', () => {
  const seedEmployees = orgSeed.employees

  it('is deterministic for the same employeeId and matches with/without name opt on seed staff', () => {
    for (const emp of seedEmployees) {
      const a = generateAppearance(emp.id, DEFAULT_CATALOG, { name: emp.name })
      const b = generateAppearance(emp.id, DEFAULT_CATALOG, { name: emp.name })
      const c = generateAppearance(emp.id, DEFAULT_CATALOG)
      expect(a).toEqual(b)
      expect(a).toEqual(c)
      expect(hashAppearance(a)).toBe(hashAppearance(b))
    }
  })

  it('uses only valid catalogue item ids, base support, and colour swatches across all 28 seed employees', () => {
    expect(seedEmployees).toHaveLength(28)

    for (const emp of seedEmployees) {
      const doc = generateAppearance(emp.id, DEFAULT_CATALOG, { name: emp.name })
      expect(StrictAppearanceV1Schema.safeParse(doc).success).toBe(true)

      expect(isValidColorKey(DEFAULT_CATALOG, 'skin', doc.skin)).toBe(true)
      expect(isValidColorKey(DEFAULT_CATALOG, 'hair', doc.hair.color)).toBe(true)
      expect(isValidColorKey(DEFAULT_CATALOG, 'eyes', doc.face.eyeColor)).toBe(true)

      const equippedIds = [
        doc.face.eyes,
        doc.face.brows,
        doc.face.mouth,
        doc.hair.item,
        doc.outfit.fullbody,
        doc.outfit.top,
        doc.outfit.bottom,
        doc.outfit.outer,
        doc.outfit.shoes,
        ...Object.values(doc.accessories),
      ].filter((id): id is string => Boolean(id))

      for (const id of equippedIds) {
        const item = getCatalogItem(DEFAULT_CATALOG, id)
        expect(item).toBeDefined()
        if (item) {
          expect(hasBaseSupport(item, doc.base)).toBe(true)
        }
      }

      for (const [itemId, regions] of Object.entries(doc.colors)) {
        const item = getCatalogItem(DEFAULT_CATALOG, itemId)
        expect(item).toBeDefined()
        for (const colorKey of Object.values(regions)) {
          if (colorKey !== undefined) {
            expect(DEFAULT_CATALOG.palette.has(colorKey)).toBe(true)
          }
        }
      }
    }
  })

  it('produces >= 20 visually distinct looks and no duplicate hair+top/fullbody+bottom+primary colours across all 28 seed employees', () => {
    const looks = seedEmployees.map((emp) =>
      generateAppearance(emp.id, DEFAULT_CATALOG, { name: emp.name }),
    )

    const signatures = new Set(looks.map(outfitSignature))
    expect(signatures.size).toBeGreaterThanOrEqual(20)
    expect(signatures.size).toBe(seedEmployees.length)
  })

  it('infers sensible bases for seed names and temp employees deterministically', () => {
    expect(generateAppearance('emp_thu', DEFAULT_CATALOG, { name: 'Thu' }).base).toBe('female')
    expect(generateAppearance('emp_quan', DEFAULT_CATALOG, { name: 'Quân' }).base).toBe('male')
    expect(generateAppearance('emp_temp_01', DEFAULT_CATALOG, { name: 'My (Tạm 1)' }).base).toBe('female')
    expect(generateAppearance('emp_temp_02', DEFAULT_CATALOG, { name: 'Dũng (Tạm 8)' }).base).toBe('male')
  })
})

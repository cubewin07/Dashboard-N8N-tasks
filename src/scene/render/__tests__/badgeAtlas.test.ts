import { describe, expect, it } from 'vitest'
import platforms from '@/content/platforms.json'
import { buildBadgeAtlasLayout, type BadgeSource } from '../badgeAtlas'

const seed = platforms as BadgeSource[]

describe('buildBadgeAtlasLayout', () => {
  it('has one cell per platform row, inside the texture', () => {
    const layout = buildBadgeAtlasLayout(seed)
    expect(layout.grid.cells.size).toBe(seed.length)
    for (const p of seed) {
      const cell = layout.grid.cells.get(p.key)!
      expect(cell).toBeDefined()
      expect(cell.u0).toBeGreaterThanOrEqual(0)
      expect(cell.v0).toBeGreaterThanOrEqual(0)
      expect(cell.u0 + cell.du).toBeLessThanOrEqual(1 + 1e-9)
      expect(cell.v0 + cell.dv).toBeLessThanOrEqual(1 + 1e-9)
    }
    expect(layout.badges.map((b) => b.text)).toEqual(seed.map((p) => p.badge.text))
  })

  it('adding a platform row yields a new cell without code changes (R3)', () => {
    const before = buildBadgeAtlasLayout(seed)
    const added: BadgeSource = { key: 'tiki', badge: { text: 'TK', swatch: 'sky_600' } }
    const after = buildBadgeAtlasLayout([...seed, added])
    expect(after.grid.cells.size).toBe(before.grid.cells.size + 1)
    expect(after.grid.cells.get('tiki')).toBeDefined()
    expect(after.badges.at(-1)).toEqual({ key: 'tiki', text: 'TK', swatch: 'sky_600' })
    // Cells never overlap.
    const spots = new Set([...after.grid.cells.values()].map((c) => `${c.col},${c.row}`))
    expect(spots.size).toBe(after.grid.cells.size)
  })

  it('ignores a duplicated key', () => {
    const layout = buildBadgeAtlasLayout([...seed, seed[0]!])
    expect(layout.grid.cells.size).toBe(seed.length)
  })
})

import { describe, expect, it } from 'vitest'
import { generateAppearance } from '@/scene/characters/generate'
import { visibleWorn } from '../outfit'

describe('visibleWorn', () => {
  it('lists worn items without face slots and never lists a hidden slot', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const worn = visibleWorn(generateAppearance(id))
      expect(worn.length).toBeGreaterThan(0)
      expect(worn.some((w) => ['eyes', 'brows', 'mouth'].includes(w.slot))).toBe(false)
      const slots = worn.map((w) => w.slot)
      if (slots.includes('fullbody')) expect(slots).not.toContain('top')
    }
  })
})

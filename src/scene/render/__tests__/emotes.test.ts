import { describe, expect, it } from 'vitest'
import { EMOTE_KEYS } from '@/domain/visual'
import { idleBehaviours, visualLanguage } from '@/office/visualConfig'
import { EMOTE_ATLAS, selectEmotes, type EmoteCandidate } from '../Emotes'

const at = (index: number, x: number): EmoteCandidate => ({ index, x, y: 0, z: 0 })

describe('selectEmotes', () => {
  it('keeps the nearest to the camera first, capped at max (R12)', () => {
    const candidates = Array.from({ length: 30 }, (_, i) => at(i, 30 - i))
    const out = selectEmotes(candidates, { x: 0, y: 0, z: 0 }, visualLanguage.emotes.max)
    expect(out).toHaveLength(visualLanguage.emotes.max)
    expect(out[0]!.index).toBe(29)
    const d = out.map((c) => c.x)
    expect([...d].sort((a, b) => a - b)).toEqual(d)
    expect(Math.max(...d)).toBeLessThan(Math.min(...candidates.filter((c) => !out.includes(c)).map((c) => c.x)))
  })

  it('returns everybody when under the cap, nothing for max 0', () => {
    const candidates = [at(0, 5), at(1, 1)]
    expect(selectEmotes(candidates, { x: 0, y: 0, z: 0 }, 12).map((c) => c.index)).toEqual([1, 0])
    expect(selectEmotes(candidates, { x: 0, y: 0, z: 0 }, 0)).toEqual([])
  })

  it('reuses the output array', () => {
    const out: EmoteCandidate[] = [at(9, 9)]
    const res = selectEmotes([at(0, 1)], { x: 0, y: 0, z: 0 }, 3, out)
    expect(res).toBe(out)
    expect(res.map((c) => c.index)).toEqual([0])
  })
})

describe('emote atlas', () => {
  it('has a cell for every emote key, including every idle option emote', () => {
    for (const key of EMOTE_KEYS) expect(EMOTE_ATLAS.cells.get(key)).toBeDefined()
    for (const o of idleBehaviours.options) if (o.emote) expect(EMOTE_ATLAS.cells.get(o.emote)).toBeDefined()
  })
})

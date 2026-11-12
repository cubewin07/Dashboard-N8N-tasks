import { describe, expect, it } from 'vitest'
import idleJson from '@/content/idle-behaviours.json'
import paletteJson from '@/content/palette.json'
import visualJson from '@/content/visual-language.json'
import { IdleBehavioursSchema, VisualLanguageSchema, VISUAL_STATUS_KEYS } from '../visual'

describe('visual-language.json', () => {
  it('parses and covers every visual status', () => {
    const v = VisualLanguageSchema.parse(visualJson)
    for (const key of VISUAL_STATUS_KEYS) expect(v.status[key]).toBeDefined()
    expect(v.pile.maxSheets).toBe(30)
    expect(v.emotes.max).toBe(12)
  })

  it('uses only palette swatches for status colours', () => {
    const keys = new Set(paletteJson.map((s) => s.key))
    const v = VisualLanguageSchema.parse(visualJson)
    for (const look of Object.values(v.status)) expect(keys.has(look.swatch)).toBe(true)
    for (const sw of Object.values(v.pile.priorityEdge)) expect(keys.has(sw)).toBe(true)
  })

  it('fails when a required key is removed', () => {
    const broken: Record<string, unknown> = structuredClone(visualJson)
    delete broken.pile
    expect(VisualLanguageSchema.safeParse(broken).success).toBe(false)
  })

  it('rejects pulses faster than 1 Hz', () => {
    const broken = structuredClone(visualJson)
    broken.ring.pulseHz = 2
    expect(VisualLanguageSchema.safeParse(broken).success).toBe(false)
  })
})

describe('idle-behaviours.json', () => {
  it('parses with the seed options of §3.3', () => {
    const idle = IdleBehavioursSchema.parse(idleJson)
    const keys = idle.options.map((o) => o.key)
    for (const k of ['stay_at_desk', 'chat_pair', 'coffee', 'tea_table', 'pingpong', 'karaoke', 'lunch_nap', 'night_rest']) {
      expect(keys).toContain(k)
    }
  })

  it('rejects duplicate option keys', () => {
    const broken = structuredClone(idleJson)
    broken.options.push(broken.options[0]!)
    expect(IdleBehavioursSchema.safeParse(broken).success).toBe(false)
  })

  it('fails when a required key is removed', () => {
    const broken: Record<string, unknown> = structuredClone(idleJson)
    delete broken.options
    expect(IdleBehavioursSchema.safeParse(broken).success).toBe(false)
  })
})

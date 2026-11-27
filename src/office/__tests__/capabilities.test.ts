import { describe, expect, it } from 'vitest'
import { effectiveQuality, qualityFor, qualitySettings, type Capabilities } from '../capabilities'

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  webgl2: true,
  maxTextureSize: 16384,
  deviceMemoryGb: 8,
  cores: 10,
  renderer: null,
  ...over,
})

describe('capability check (P11-T05)', () => {
  it('picks a quality from what the device reports', () => {
    expect(qualityFor(caps())).toBe('high')
    expect(qualityFor(caps({ deviceMemoryGb: null, cores: null }))).toBe('high')
    expect(qualityFor(caps({ deviceMemoryGb: 4 }))).toBe('medium')
    expect(qualityFor(caps({ cores: 4 }))).toBe('medium')
    expect(qualityFor(caps({ deviceMemoryGb: 2 }))).toBe('low')
    expect(qualityFor(caps({ maxTextureSize: 2048 }))).toBe('low')
    expect(qualityFor(caps({ webgl2: false }))).toBe('off')
  })

  it('the user choice wins, but never switches WebGL on', () => {
    expect(effectiveQuality('low', caps())).toBe('low')
    expect(effectiveQuality('high', caps({ deviceMemoryGb: 2 }))).toBe('high')
    expect(effectiveQuality('auto', caps({ cores: 2 }))).toBe('medium')
    expect(effectiveQuality('high', caps({ webgl2: false }))).toBe('off')
  })

  it('lower quality never costs more', () => {
    const [h, m, l] = (['high', 'medium', 'low'] as const).map(qualitySettings)
    expect(h!.maxDpr).toBeGreaterThanOrEqual(m!.maxDpr)
    expect(m!.maxDpr).toBeGreaterThanOrEqual(l!.maxDpr)
    expect(l!.shadows).toBe('none')
  })
})

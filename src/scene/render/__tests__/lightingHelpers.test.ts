import { describe, expect, it } from 'vitest'
import type * as THREE from 'three'
import { deltaE, hexToRgb, rgbToLab, srgbToXyz } from '../colorDelta'
import { applyDayLight } from '../DayNight'
import { LIGHT_BASE } from '../Lights'
import { hasSunIntensityChanged, hasSunMoved } from '../shadowCache'

describe('colorDelta pure helpers', () => {
  it('parses 3-character and 6-character hex colors accurately', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('000')).toEqual([0, 0, 0])
    expect(hexToRgb('#0F766E')).toEqual([15, 118, 110])
    expect(hexToRgb('0F766E')).toEqual([15, 118, 110])
    expect(() => hexToRgb('invalid')).toThrowError('Invalid hex color')
  })

  it('converts sRGB to CIE XYZ and CIE L*a*b*', () => {
    // Pure black
    const blackXyz = srgbToXyz(0, 0, 0)
    expect(blackXyz).toEqual([0, 0, 0])
    const blackLab = rgbToLab(0, 0, 0)
    expect(blackLab[0]).toBeCloseTo(0, 1)

    // Pure white (D65 white point: X ≈ 0.95047, Y = 1.0, Z ≈ 1.08883)
    const whiteXyz = srgbToXyz(255, 255, 255)
    expect(whiteXyz[0]).toBeCloseTo(0.95047, 3)
    expect(whiteXyz[1]).toBeCloseTo(1.0, 3)
    expect(whiteXyz[2]).toBeCloseTo(1.08883, 3)
    const whiteLab = rgbToLab(255, 255, 255)
    expect(whiteLab[0]).toBeCloseTo(100, 1)
    expect(whiteLab[1]).toBeCloseTo(0, 1)
    expect(whiteLab[2]).toBeCloseTo(0, 1)
  })

  it('computes ΔE = 0 for identical colors', () => {
    expect(deltaE('#0F766E', '#0F766E')).toBe(0)
    expect(deltaE([15, 118, 110], [15, 118, 110])).toBe(0)
  })

  it('computes small ΔE (< 1.5) for imperceptible / barely perceptible color nudges', () => {
    // #0F766E is [15, 118, 110]
    // Nudge 1 unit: [15, 119, 110]
    const dE = deltaE([15, 118, 110], [15, 119, 110])
    expect(dE).toBeGreaterThan(0)
    expect(dE).toBeLessThan(1.0)
  })

  it('computes large ΔE (> 20) for distinctly different colors', () => {
    const dE = deltaE('#0F766E', '#FF0000') // teal vs red
    expect(dE).toBeGreaterThan(50)
  })

  it('symmetric: deltaE(c1, c2) === deltaE(c2, c1)', () => {
    const d1 = deltaE('#0F766E', '#2563EB')
    const d2 = deltaE('#2563EB', '#0F766E')
    expect(d1).toBeCloseTo(d2, 5)
  })
})

describe('hasSunMoved pure helper', () => {
  it('returns false when position difference is below threshold', () => {
    const p1 = [24, 36, 30] as const
    const p2 = [24.01, 36.01, 30.01] as const
    expect(hasSunMoved(p1, p2, 0.05)).toBe(false)
  })

  it('returns true when position difference exceeds threshold along any axis', () => {
    const p1 = { x: 24, y: 36, z: 30 }
    expect(hasSunMoved(p1, { x: 24.1, y: 36, z: 30 }, 0.05)).toBe(true)
    expect(hasSunMoved(p1, { x: 24, y: 36.1, z: 30 }, 0.05)).toBe(true)
    expect(hasSunMoved(p1, { x: 24, y: 36, z: 30.1 }, 0.05)).toBe(true)
  })

  it('works with both Vector3Like objects and tuple arrays', () => {
    const v1 = { x: 0, y: 0, z: 0 }
    const v2 = [0, 0, 0.1] as const
    expect(hasSunMoved(v1, v2, 0.05)).toBe(true)
    expect(hasSunMoved(v2, v1, 0.2)).toBe(false)
  })

  it('handles exact threshold boundary strictly (only > threshold triggers move)', () => {
    const p1 = [0, 0, 0] as const
    const p2 = [0.05, 0, 0] as const
    // Distance squared = 0.0025, threshold squared = 0.0025 -> false
    expect(hasSunMoved(p1, p2, 0.05)).toBe(false)
    const p3 = [0.0501, 0, 0] as const
    expect(hasSunMoved(p1, p3, 0.05)).toBe(true)
  })
})

describe('hasSunIntensityChanged pure helper', () => {
  it('returns false for small intensity shifts', () => {
    expect(hasSunIntensityChanged(1.0, 1.02, 0.05)).toBe(false)
  })

  it('returns true for shifts exceeding threshold', () => {
    expect(hasSunIntensityChanged(1.0, 1.08, 0.05)).toBe(true)
    expect(hasSunIntensityChanged(1.0, 0.9, 0.05)).toBe(true)
  })
})

describe('applyDayLight environmentIntensity', () => {
  it('sets LIGHT_BASE.env at noon and dims it at night', () => {
    const fakeScene = { environmentIntensity: 0 } as unknown as THREE.Scene
    applyDayLight(
      { daylight: 1, warmth: 0 },
      { background: null, hemi: null, sun: null, scene: fakeScene },
    )
    expect(fakeScene.environmentIntensity).toBeCloseTo(LIGHT_BASE.env, 5)

    applyDayLight(
      { daylight: 0, warmth: 0 },
      { background: null, hemi: null, sun: null, scene: fakeScene },
    )
    expect(fakeScene.environmentIntensity).toBeGreaterThan(0)
    expect(fakeScene.environmentIntensity).toBeLessThan(LIGHT_BASE.env)
  })
})

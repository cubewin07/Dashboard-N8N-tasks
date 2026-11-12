import { describe, expect, it } from 'vitest'
import { lodBand, overrideBand } from '../lod'

const t = { nearMax: 18, midMax: 45, hysteresis: 0.1 }

describe('lodBand', () => {
  it('picks a band from distance alone', () => {
    expect(lodBand(10, null, t)).toBe('near')
    expect(lodBand(30, null, t)).toBe('mid')
    expect(lodBand(80, null, t)).toBe('far')
  })

  it('holds the previous band inside the hysteresis margin', () => {
    expect(lodBand(19, 'near', t)).toBe('near') // < 18 × 1.1
    expect(lodBand(20, 'near', t)).toBe('mid')
    expect(lodBand(17, 'mid', t)).toBe('mid') // > 18 × 0.9
    expect(lodBand(16, 'mid', t)).toBe('near')
    expect(lodBand(48, 'mid', t)).toBe('mid')
    expect(lodBand(50, 'mid', t)).toBe('far')
    expect(lodBand(42, 'far', t)).toBe('far')
    expect(lodBand(40, 'far', t)).toBe('mid')
  })

  it('lets camera modes override distance', () => {
    const focus = { mode: 'floor', focusedFloorIndex: 2, followedFloorIndex: null }
    expect(overrideBand(2, 'far', focus)).toBe('near')
    expect(overrideBand(3, 'near', focus)).toBe('far')
    const follow = { mode: 'follow', focusedFloorIndex: null, followedFloorIndex: 1 }
    expect(overrideBand(1, 'far', follow)).toBe('near')
    expect(overrideBand(0, 'mid', follow)).toBe('mid')
  })
})

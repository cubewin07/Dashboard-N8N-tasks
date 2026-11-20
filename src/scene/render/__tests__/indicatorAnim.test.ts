import { describe, expect, it } from 'vitest'
import { BOB, easeOutCubic, EASE_IN_SECONDS, iconBob, StatusEase } from '../indicatorAnim'

describe('easeOutCubic', () => {
  it('runs 0 to 1, fast first, and clamps', () => {
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
    expect(easeOutCubic(2)).toBe(1)
  })
})

describe('iconBob', () => {
  it('stays within the bob height and is still under reduced motion', () => {
    for (let t = 0; t < 4; t += 0.1) expect(Math.abs(iconBob(t, 0.3, 1))).toBeLessThanOrEqual(BOB.height + 1e-9)
    expect(iconBob(1.2, 0.3, 0)).toBe(0)
  })
})

describe('StatusEase', () => {
  const id = 'emp_1' as never
  it('restarts when the status changes or the person was away', () => {
    const e = new StatusEase()
    e.begin()
    expect(e.value(id, 'working', 10, false)).toBe(0)
    e.begin()
    expect(e.value(id, 'working', 10 + EASE_IN_SECONDS, false)).toBe(1)
    e.begin()
    expect(e.value(id, 'blocked', 11, false)).toBe(0)
    e.begin()
    e.begin()
    expect(e.value(id, 'blocked', 12, false)).toBe(0)
  })

  it('is instant when asked', () => {
    const e = new StatusEase()
    e.begin()
    expect(e.value(id, 'working', 0, true)).toBe(1)
  })
})

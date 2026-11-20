import { describe, expect, it } from 'vitest'
import { arcCovers, deskGlowFor, easeProgress, progressArc, showsProgress } from '../deskStatusModel'

describe('deskGlowFor (P05-T04)', () => {
  it('maps activity and task status to a monitor glow', () => {
    expect(deskGlowFor('working', 'in_progress')).toBe('working')
    expect(deskGlowFor('reviewing', null)).toBe('working')
    expect(deskGlowFor('working', 'blocked')).toBe('blocked')
    expect(deskGlowFor('idle', 'failed')).toBe('blocked')
    expect(deskGlowFor('working', 'in_review')).toBe('done')
    expect(deskGlowFor('idle', 'done')).toBe('done')
    expect(deskGlowFor('idle', null)).toBe('off')
    expect(deskGlowFor('resting', null)).toBe('off')
    expect(deskGlowFor('off_shift', undefined)).toBe('off')
    expect(deskGlowFor(undefined, undefined)).toBe('off')
  })

  it('shows progress only while a task is open', () => {
    expect(showsProgress('in_progress')).toBe(true)
    expect(showsProgress('blocked')).toBe(true)
    expect(showsProgress('done')).toBe(false)
    expect(showsProgress(null)).toBe(false)
  })
})

describe('progressArc', () => {
  it('draws a half ring at 0.5', () => {
    const { fraction, angle } = progressArc(0.5)
    expect(fraction).toBe(0.5)
    expect(angle).toBeCloseTo(Math.PI)
    // Right side (3 o'clock … 6 o'clock) is filled, left side is not.
    expect(arcCovers(Math.PI / 2, fraction)).toBe(true)
    expect(arcCovers(Math.PI * 0.99, fraction)).toBe(true)
    expect(arcCovers(Math.PI * 1.5, fraction)).toBe(false)
  })

  it('clamps and handles empty and full', () => {
    expect(progressArc(-1).fraction).toBe(0)
    expect(progressArc(2).fraction).toBe(1)
    expect(progressArc(Number.NaN).fraction).toBe(0)
    expect(arcCovers(0, 0)).toBe(false)
    expect(arcCovers(Math.PI * 1.99, 1)).toBe(true)
  })
})

describe('easeProgress', () => {
  it('glides towards the target and never overshoots', () => {
    let v = 0
    for (let i = 0; i < 10; i += 1) {
      const next = easeProgress(v, 0.8, 0.05, false)
      expect(next).toBeGreaterThan(v)
      expect(next).toBeLessThanOrEqual(0.8)
      v = next
    }
    expect(v).toBeLessThan(0.8)
    expect(easeProgress(0.799, 0.8, 0.05, false)).toBe(0.8)
  })

  it('goes back down too, and snaps under reduced motion', () => {
    expect(easeProgress(0.9, 0.2, 0.1, false)).toBeLessThan(0.9)
    expect(easeProgress(0, 0.8, 0.1, true)).toBe(0.8)
  })
})

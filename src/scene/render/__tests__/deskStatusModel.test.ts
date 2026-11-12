import { describe, expect, it } from 'vitest'
import { arcCovers, deskGlowFor, progressArc, showsProgress } from '../deskStatusModel'

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

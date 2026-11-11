import { describe, expect, it } from 'vitest'
import { computeNextProgress } from '../brain/work'

describe('computeNextProgress', () => {
  it('accumulates small steps instead of rounding them away', () => {
    // 7.5 s tick on a 60-minute task: +0.00208 per tick, below 2-decimal precision.
    let progress = 0
    for (let i = 0; i < 100; i++) {
      progress = computeNextProgress(progress, 7_500, 3_600_000)
    }
    expect(progress).toBeGreaterThan(0.2)
  })

  it('finishes a 90-minute task after 90 sim-minutes of ticks', () => {
    let progress = 0
    for (let i = 0; i < 720; i++) {
      progress = computeNextProgress(progress, 7_500, 90 * 60_000)
    }
    expect(progress).toBe(1)
  })

  it('treats a zero duration as already done', () => {
    expect(computeNextProgress(0, 7_500, 0)).toBe(1)
  })
})

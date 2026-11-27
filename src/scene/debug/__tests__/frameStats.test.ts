import { describe, expect, it } from 'vitest'
import { FrameStats } from '../frameStats'

describe('FrameStats (P11-T01)', () => {
  it('reports fps and the 95th-percentile frame time over a rolling window', () => {
    const f = new FrameStats(100)
    expect(f.fps()).toBe(0)
    expect(f.p95()).toBe(0)
    for (let i = 0; i < 95; i += 1) f.push(16)
    for (let i = 0; i < 5; i += 1) f.push(50)
    expect(f.p95()).toBe(16)
    f.push(50) // drops one 16 ms frame: now 6 slow frames of 100
    expect(f.p95()).toBe(50)
    expect(f.fps()).toBeGreaterThan(40)
    expect(f.size).toBe(100)
  })

  it('ignores junk and can be reset', () => {
    const f = new FrameStats(4)
    f.push(Number.NaN)
    f.push(-1)
    expect(f.size).toBe(0)
    f.push(20)
    expect(f.fps()).toBe(50)
    f.reset()
    expect(f.size).toBe(0)
  })
})

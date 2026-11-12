import { describe, expect, it } from 'vitest'
import { ClockRateEstimator } from '../clockRate'

/** Feed a stepping clock: every `stepReal` seconds it jumps by `rate × stepReal`. */
function run(est: ClockRateEstimator, from: number, seconds: number, rate: number, stepReal: number, feedStart: number) {
  let out = 0
  let feed = feedStart
  let nextStep = from + stepReal
  for (let t = from; t <= from + seconds + 1e-9; t += 1 / 60) {
    if (rate > 0 && t >= nextStep) {
      feed += rate * stepReal * 1000
      nextStep += stepReal
    }
    out = est.sample(feed, t)
  }
  return { rate: out, feed }
}

describe('ClockRateEstimator', () => {
  it('assumes real time until it has measured', () => {
    expect(new ClockRateEstimator().sample(1000, 0)).toBe(1)
  })

  it('measures a stepping clock at 30× and 120×', () => {
    const a = new ClockRateEstimator()
    // Sampled at 60 Hz, so a step is seen up to one frame late.
    expect(Math.abs(run(a, 0, 3, 30, 0.25, 0).rate - 30)).toBeLessThan(1)
    const b = new ClockRateEstimator()
    expect(Math.abs(run(b, 0, 3, 120, 0.25, 0).rate - 120)).toBeLessThan(4)
  })

  it('follows a wall clock at 1×', () => {
    const est = new ClockRateEstimator()
    let rate = 0
    for (let i = 0; i < 240; i += 1) rate = est.sample(i * (1000 / 60), i / 60)
    expect(rate).toBeCloseTo(1, 2)
  })

  it('reports a pause and resumes at the old rate straight away', () => {
    const est = new ClockRateEstimator()
    const first = run(est, 0, 3, 30, 0.25, 0)
    expect(run(est, 3, 3, 0, 0.25, first.feed).rate).toBe(0)
    // One step after the pause is enough to move again.
    expect(Math.abs(est.sample(first.feed + 7500, 6.3) - 30)).toBeLessThan(1)
  })

  it('survives a feed restart (time goes back)', () => {
    const est = new ClockRateEstimator()
    run(est, 0, 2, 30, 0.25, 1_000_000)
    expect(Math.abs(run(est, 2, 3, 120, 0.25, 0).rate - 120)).toBeLessThan(4)
  })
})

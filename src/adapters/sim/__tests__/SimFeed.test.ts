import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { OfficeEvent } from '@/domain/events'
import { createSimFeed } from '../SimFeed'

describe('SimFeed determinism & clock speed invariance (P03-T07)', () => {
  it('emits identical logs when two feeds with the same seed are stepped 2,000 ticks', async () => {
    const cfg = makeSeedConfig()
    const feedA = createSimFeed({
      seed: 'p03-determinism-seed',
      speed: 30,
      autoStartTimer: false,
      bindGlobalControls: false,
    })
    const feedB = createSimFeed({
      seed: 'p03-determinism-seed',
      speed: 30,
      autoStartTimer: false,
      bindGlobalControls: false,
    })

    const logA: OfficeEvent[] = []
    const logB: OfficeEvent[] = []

    await feedA.start(cfg)
    await feedB.start(cfg)

    feedA.subscribe((batch) => logA.push(...batch))
    feedB.subscribe((batch) => logB.push(...batch))

    feedA.step(2_000)
    feedB.step(2_000)

    expect(logA.length).toBeGreaterThan(100)
    expect(logA).toEqual(logB)
    expect(feedA.getState().seq).toBe(feedB.getState().seq)
    expect(feedA.now()).toBe(feedB.now())
  })

  it('produces the exact same event log for the same sim duration regardless of speed changes', async () => {
    const cfg = makeSeedConfig()
    const feed30 = createSimFeed({
      seed: 'speed-invariance-42',
      speed: 30,
      autoStartTimer: false,
      bindGlobalControls: false,
    })
    const feedMixed = createSimFeed({
      seed: 'speed-invariance-42',
      speed: 120,
      autoStartTimer: false,
      bindGlobalControls: false,
    })

    const log30: OfficeEvent[] = []
    const logMixed: OfficeEvent[] = []

    await feed30.start(cfg)
    await feedMixed.start(cfg)

    feed30.subscribe((batch) => log30.push(...batch))
    feedMixed.subscribe((batch) => logMixed.push(...batch))

    // 480 ticks at 30x = 480 * 7.5s = 3,600s (1 sim hour)
    feed30.step(480)

    // Mixed: 60 ticks at 120x (= 240 quanta) + pause (10 ticks at 0x = 0 quanta) + 240 ticks at 30x (= 240 quanta) = 480 quanta
    feedMixed.step(60)
    feedMixed.setSpeed(0)
    feedMixed.step(10)
    feedMixed.setSpeed(30)
    feedMixed.step(240)

    expect(feedMixed.now()).toBe(feed30.now())
    expect(logMixed).toEqual(log30)
  })
})

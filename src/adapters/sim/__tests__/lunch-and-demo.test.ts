import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { OfficeEvent } from '@/domain/events'
import { autoApproveBossDelaySimMs } from '../brain/odds'
import { createSimFeed } from '../SimFeed'

describe('lunch location hints', () => {
  it('rests on the rest floor and points back at the desk afterwards', async () => {
    const feed = createSimFeed({
      seed: 7,
      speed: 30,
      autoStartTimer: false,
      bindGlobalControls: false,
    })
    const events: OfficeEvent[] = []
    await feed.start(makeSeedConfig())
    feed.subscribe((b) => events.push(...b))
    feed.stepSimMs(7 * 3_600_000) // 08:00 -> 15:00 spans lunch

    const activity = events.filter(
      (e): e is OfficeEvent<'person.activity'> => e.type === 'person.activity',
    )
    const resting = activity.filter((e) => e.payload.activity === 'resting')
    expect(resting.length).toBeGreaterThan(0)
    for (const e of resting) {
      expect(e.payload.locationHint).toEqual({ floorKey: 'games_rest', target: 'other' })
    }

    const state = feed.getState()
    const floorKeys = new Set(state.config.departments.map((d) => d.key))
    const back = activity.filter(
      (e) =>
        e.payload.activity !== 'resting' &&
        e.payload.activity !== 'off_shift' &&
        e.payload.locationHint,
    )
    expect(back.length).toBeGreaterThan(0)
    for (const e of back) {
      expect(floorKeys.has(e.payload.locationHint!.floorKey)).toBe(true)
    }
  })
})

describe('auto-approve demo delay', () => {
  it('is two real minutes at any speed, not two sim minutes', () => {
    expect(autoApproveBossDelaySimMs(1)).toBe(120_000)
    expect(autoApproveBossDelaySimMs(30)).toBe(3_600_000)
    expect(autoApproveBossDelaySimMs(0)).toBe(120_000)
  })
})

import { describe, expect, it } from 'vitest'
import {
  CharacterLodScheduler,
  characterMixerRate,
  createLodSlot,
  stepLodSlot,
} from '../lod'

describe('characterMixerRate', () => {
  it('selects 30 / 15 / 5 / 0 Hz according to §3.6 rules', () => {
    // 0 Hz when hidden or outside frustum.
    expect(characterMixerRate({ distance: 5, opacity: 0 })).toBe(0)
    expect(characterMixerRate({ distance: 5, opacity: 0.01 })).toBe(0)
    expect(characterMixerRate({ distance: 5, visible: false })).toBe(0)
    expect(characterMixerRate({ distance: 5, inFrustum: false })).toBe(0)
    expect(characterMixerRate({ distance: 5, followed: true, opacity: 0.005 })).toBe(0)

    // 30 Hz when followed, selected, or visible on focused floor within 25 m.
    expect(characterMixerRate({ distance: 90, opacity: 1, followed: true })).toBe(30)
    expect(characterMixerRate({ distance: 70, opacity: 1, selected: true })).toBe(30)
    expect(characterMixerRate({ distance: 10, opacity: 1, onFocusedFloor: true })).toBe(30)
    expect(characterMixerRate({ distance: 25, opacity: 1, onFocusedFloor: true })).toBe(30)

    // 15 Hz when visible 25–60 m (or within 25 m on an unfocused floor).
    expect(characterMixerRate({ distance: 26, opacity: 1 })).toBe(15)
    expect(characterMixerRate({ distance: 60, opacity: 1 })).toBe(15)
    expect(characterMixerRate({ distance: 12, opacity: 1, onFocusedFloor: false })).toBe(15)

    // 5 Hz when visible > 60 m.
    expect(characterMixerRate({ distance: 60.1, opacity: 1 })).toBe(5)
    expect(characterMixerRate({ distance: 120, opacity: 1 })).toBe(5)
  })
})

describe('CharacterLodScheduler', () => {
  it('staggers 80 people in overview (5 Hz) across frames with ~400 mixer steps/sec', () => {
    const scheduler = new CharacterLodScheduler()
    const dt = 1 / 60
    const frames = 60 // 1 second
    const peopleCount = 80
    const perFrameUpdates: number[] = []
    const perPersonSteps = new Array<number>(peopleCount).fill(0)
    const perPersonDt = new Array<number>(peopleCount).fill(0)

    for (let f = 0; f < frames; f += 1) {
      scheduler.beginFrame()
      for (let i = 0; i < peopleCount; i += 1) {
        const res = scheduler.step(`emp_${i}`, { distance: 80, opacity: 1 }, dt)
        expect(res.rate).toBe(5)
        expect(res.visible).toBe(true)
        if (res.shouldUpdate) {
          perPersonSteps[i]! += 1
          perPersonDt[i]! += res.stepDt
        }
      }
      perFrameUpdates.push(scheduler.updatesThisFrame)
    }

    // Total mixer updates across 80 people at 5 Hz for 1 s = 400.
    expect(scheduler.totalMixerUpdates).toBe(400)
    // Staggered across 12 frames/cycle (~6.67 per frame), never all 80 on one frame.
    expect(Math.max(...perFrameUpdates)).toBeLessThanOrEqual(10)
    expect(Math.min(...perFrameUpdates)).toBeGreaterThanOrEqual(4)
    // Every person updates 5 times and advances within one period of 1.0 s.
    for (let i = 0; i < peopleCount; i += 1) {
      expect(perPersonSteps[i]).toBe(5)
      expect(perPersonDt[i]).toBeGreaterThan(0.8)
      expect(perPersonDt[i]).toBeLessThanOrEqual(1.0 + 1e-6)
    }
  })

  it('produces expected steps/sec for 15 Hz and 30 Hz, and 0 updates when paused or hidden', () => {
    const scheduler = new CharacterLodScheduler()
    const dt = 1 / 60

    let steps15 = 0
    let steps30 = 0
    let steps0 = 0
    let dt15 = 0
    let dt30 = 0

    for (let f = 0; f < 60; f += 1) {
      const r15 = scheduler.step('mid', { distance: 40, opacity: 1 }, dt)
      if (r15.shouldUpdate) {
        steps15 += 1
        dt15 += r15.stepDt
      }
      const r30 = scheduler.step('near', { distance: 10, opacity: 1 }, dt)
      if (r30.shouldUpdate) {
        steps30 += 1
        dt30 += r30.stepDt
      }
      const r0 = scheduler.step('hidden', { distance: 10, opacity: 0 }, dt)
      expect(r0.visible).toBe(false)
      if (r0.shouldUpdate) steps0 += 1
    }

    expect(steps15).toBe(15)
    expect(steps30).toBe(30)
    expect(steps0).toBe(0)
    expect(dt15).toBeGreaterThan(1 - 1 / 15 - 1e-6)
    expect(dt15).toBeLessThanOrEqual(1.0 + 1e-6)
    expect(dt30).toBeGreaterThan(1 - 1 / 30 - 1e-6)
    expect(dt30).toBeLessThanOrEqual(1.0 + 1e-6)

    // Paused (dt = 0) does not advance mixer.
    const slot = createLodSlot(0)
    const paused = stepLodSlot(slot, 30, 0)
    expect(paused.shouldUpdate).toBe(false)
    expect(paused.stepDt).toBe(0)
  })
})

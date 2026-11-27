import { beforeEach, describe, expect, it } from 'vitest'
import { fishYaw, lifeTime, resetLifeClock } from '../lifeClock'
import { peopleRuntime } from '../peopleRuntime'

describe('lifeTime', () => {
  beforeEach(() => {
    resetLifeClock()
    peopleRuntime.moveFactor = 1
  })

  it('advances once per frame however many layers ask', () => {
    expect(lifeTime(1, 0.1)).toBeCloseTo(0.1)
    expect(lifeTime(1, 0.1)).toBeCloseTo(0.1)
    expect(lifeTime(1.1, 0.1)).toBeCloseTo(0.2)
  })

  it('stands still while the office is paused and resumes without a jump', () => {
    lifeTime(1, 0.1)
    peopleRuntime.moveFactor = 0
    expect(lifeTime(50, 49)).toBeCloseTo(0.1)
    peopleRuntime.moveFactor = 1
    expect(lifeTime(50.1, 0.1)).toBeCloseTo(0.2)
  })
})

describe('fishYaw', () => {
  it('faces right and left at full speed and turns smoothly in between', () => {
    expect(fishYaw(1)).toBe(0)
    expect(fishYaw(-1)).toBeCloseTo(Math.PI)
    expect(fishYaw(0)).toBeCloseTo(Math.PI / 2)
    expect(fishYaw(0.1)).toBeGreaterThan(0)
    expect(fishYaw(0.1)).toBeLessThan(Math.PI / 2)
  })
})

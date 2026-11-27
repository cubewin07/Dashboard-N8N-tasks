import { describe, expect, it } from 'vitest'
import { doorOpening } from '../ElevatorCars'

describe('doorOpening', () => {
  it('interpolates between ticks and stays within 0..1', () => {
    expect(doorOpening(0, 0.5, 0)).toBe(0)
    expect(doorOpening(0, 0.5, 0.5)).toBeCloseTo(0.25)
    expect(doorOpening(0, 0.5, 1)).toBeCloseTo(0.5)
    expect(doorOpening(1, 0, 0.25)).toBeCloseTo(0.75)
    expect(doorOpening(0.9, 1, 3)).toBe(1)
    expect(doorOpening(0.1, 0, 3)).toBe(0)
  })
})

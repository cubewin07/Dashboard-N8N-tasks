import { describe, expect, it } from 'vitest'
import { indicatorNumber } from '../ElevatorCars'

describe('indicatorNumber (P05-T08)', () => {
  it('shows the nearest floor numbered like the floor picker', () => {
    expect(indicatorNumber(0, 8)).toBe(1)
    expect(indicatorNumber(2.4, 8)).toBe(3)
    expect(indicatorNumber(2.6, 8)).toBe(4)
    expect(indicatorNumber(7, 8)).toBe(8)
  })

  it('stays inside the building', () => {
    expect(indicatorNumber(-0.4, 8)).toBe(1)
    expect(indicatorNumber(9, 8)).toBe(8)
  })
})

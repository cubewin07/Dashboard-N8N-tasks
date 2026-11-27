import { describe, expect, it } from 'vitest'
import { shaftHeight, visibleFlights } from '../place'

describe('cut-away of the vertical shafts', () => {
  it('draws the whole shaft and every flight in overview', () => {
    expect(shaftHeight(18, 3, null)).toBe(18)
    expect(visibleFlights(5, null)).toBe(5)
  })

  it('stops the shaft at the focused floor slab', () => {
    expect(shaftHeight(18, 3, 0)).toBe(3)
    expect(shaftHeight(18, 3, 2)).toBe(9)
    expect(shaftHeight(18, 3, 9)).toBe(18)
  })

  it('keeps only the flights that end at or below the focused floor', () => {
    expect(visibleFlights(5, 0)).toBe(0)
    expect(visibleFlights(5, 2)).toBe(2)
    expect(visibleFlights(5, 9)).toBe(5)
  })
})

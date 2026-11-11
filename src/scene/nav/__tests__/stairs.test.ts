import { describe, expect, it } from 'vitest'
import { STAIRS_BASE_SECONDS, STAIRS_SECONDS_PER_FLOOR, stairsTime } from '../stairs'

describe('stairsTime', () => {
  it('exports the formula constants', () => {
    expect(STAIRS_BASE_SECONDS).toBe(6)
    expect(STAIRS_SECONDS_PER_FLOOR).toBe(4)
  })

  it('is 6 s + 4 s per floor travelled', () => {
    expect(stairsTime(0, 1)).toBe(10)
    expect(stairsTime(2, 6)).toBe(22)
    expect(stairsTime(0, 8)).toBe(38)
  })

  it('is symmetric', () => {
    expect(stairsTime(6, 2)).toBe(stairsTime(2, 6))
    expect(stairsTime(1, 0)).toBe(10)
  })

  it('is 0 on the same floor', () => {
    expect(stairsTime(3, 3)).toBe(0)
  })
})

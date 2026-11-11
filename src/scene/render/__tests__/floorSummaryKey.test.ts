import { describe, expect, it } from 'vitest'
import type { FloorSummary } from '@/domain/selectors'
import { decodeFloorSummaries, encodeFloorSummaries } from '../floorSummaryKey'

const a: FloorSummary = { floorKey: 'cs', working: 3, waiting: 1, reviewPile: 4, idle: 2, headcount: 10 }
const b: FloorSummary = { floorKey: 'lobby_cafe', working: 0, waiting: 0, reviewPile: 0, idle: 0, headcount: 0 }

describe('floor summary key', () => {
  it('round-trips and is equal for equal numbers', () => {
    expect(decodeFloorSummaries(encodeFloorSummaries([a, b]))).toEqual([a, b])
    expect(encodeFloorSummaries([{ ...a }])).toBe(encodeFloorSummaries([a]))
  })

  it('changes when a chip number changes, and handles no floors', () => {
    expect(encodeFloorSummaries([{ ...a, working: 4 }])).not.toBe(encodeFloorSummaries([a]))
    expect(decodeFloorSummaries('')).toEqual([])
  })
})

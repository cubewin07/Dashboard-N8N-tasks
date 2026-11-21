import { describe, expect, it } from 'vitest'
import { followFloorKey, userLeftFollow, widenAzimuth } from '../followMode'
import { defaultFloorTarget } from '../viewStore'

describe('followFloorKey', () => {
  it('walking: the floor they are on', () => {
    expect(followFloorKey({ floorKey: 'cs', riding: false }, null)).toBe('cs')
  })

  it('riding: the destination, not the floors the car passes', () => {
    // The sight names the destination for the whole ride, so the rig switches once.
    const seen = ['design', 'design', 'design'].map((floorKey) =>
      followFloorKey({ floorKey, riding: true }, 'cs'),
    )
    expect(new Set(seen)).toEqual(new Set(['design']))
  })

  it('riding with an unknown destination leaves the view alone', () => {
    expect(followFloorKey({ floorKey: '', riding: true }, 'cs')).toBeNull()
  })

  it('an unknown floor while walking keeps the floor the rig showed', () => {
    expect(followFloorKey({ floorKey: '', riding: false }, 'cs')).toBe('cs')
  })

  it('what the rig sets is never seen as the user leaving follow', () => {
    const floorKey = followFloorKey({ floorKey: 'design', riding: true }, 'cs')!
    expect(userLeftFollow({ mode: 'floor', focusedFloorKey: floorKey }, floorKey)).toBe(false)
  })
})

describe('widenAzimuth', () => {
  it('keeps limits that already contain the camera', () => {
    expect(widenAzimuth(-0.5, 0.5, 0.1)).toEqual({ min: -0.5, max: 0.5 })
  })

  it('stretches a limit to contain a camera outside it, so nothing swings', () => {
    expect(widenAzimuth(-0.5, 0.5, 1.4)).toEqual({ min: -0.5, max: 1.4 })
    expect(widenAzimuth(-0.5, 0.5, -2)).toEqual({ min: -2, max: 0.5 })
  })

  it('leaves infinite limits and non-finite azimuths alone', () => {
    expect(widenAzimuth(-Infinity, Infinity, 3)).toEqual({ min: -Infinity, max: Infinity })
    expect(widenAzimuth(-1, 1, NaN)).toEqual({ min: -1, max: 1 })
  })
})

describe('defaultFloorTarget (F key and toolbar button)', () => {
  const keys = ['lobby', 'cs', 'marketing']

  it('prefers the hovered floor, then the focused one, then the second floor', () => {
    expect(defaultFloorTarget({ hoveredFloorKey: 'marketing', focusedFloorKey: 'cs' }, keys)).toBe('marketing')
    expect(defaultFloorTarget({ hoveredFloorKey: null, focusedFloorKey: 'cs' }, keys)).toBe('cs')
    expect(defaultFloorTarget({ hoveredFloorKey: null, focusedFloorKey: null }, keys)).toBe('cs')
  })

  it('copes with one floor and none', () => {
    expect(defaultFloorTarget({ hoveredFloorKey: null, focusedFloorKey: null }, ['only'])).toBe('only')
    expect(defaultFloorTarget({ hoveredFloorKey: null, focusedFloorKey: null }, [])).toBeNull()
  })
})

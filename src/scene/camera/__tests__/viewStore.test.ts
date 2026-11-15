import { beforeEach, describe, expect, it } from 'vitest'
import {
  getFloorFadeTarget,
  parseViewSearch,
  serializeViewSearch,
  useViewStore,
} from '../viewStore'

describe('viewStore and URL search param sync (R8, R11)', () => {
  const seedFloorKeys = [
    'lobby_cafe',
    'cs',
    'marketing',
    'design',
    'accounting',
    'games_rest',
    'management',
    'boss',
  ]

  beforeEach(() => {
    useViewStore.setState({
      mode: 'overview',
      focusedFloorKey: null,
      hoveredFloorKey: null,
    })
  })

  it('R8: parses and serialises overview, free, and floor search params', () => {
    expect(parseViewSearch('', seedFloorKeys)).toEqual({
      mode: 'overview',
      focusedFloorKey: null,
    })
    expect(parseViewSearch('?cam=overview', seedFloorKeys)).toEqual({
      mode: 'overview',
      focusedFloorKey: null,
    })
    expect(parseViewSearch('?cam=free', seedFloorKeys)).toEqual({
      mode: 'free',
      focusedFloorKey: null,
    })
    expect(parseViewSearch('?cam=floor&floor=marketing', seedFloorKeys)).toEqual({
      mode: 'floor',
      focusedFloorKey: 'marketing',
    })
    expect(parseViewSearch('?cam=floor&floor=cs%232', [...seedFloorKeys, 'cs#2'])).toEqual({
      mode: 'floor',
      focusedFloorKey: 'cs#2',
    })

    expect(serializeViewSearch('overview', null)).toBe('?cam=overview')
    expect(serializeViewSearch('free', 'marketing')).toBe('?cam=free')
    expect(serializeViewSearch('floor', 'marketing')).toBe('?cam=floor&floor=marketing')
    expect(serializeViewSearch('floor', null)).toBe('?cam=overview')
  })

  it('R8: falls back to overview when floor param is missing or unknown', () => {
    expect(parseViewSearch('?cam=floor', seedFloorKeys)).toEqual({
      mode: 'overview',
      focusedFloorKey: null,
    })
    expect(parseViewSearch('?cam=floor&floor=unknown_dept', seedFloorKeys)).toEqual({
      mode: 'overview',
      focusedFloorKey: null,
    })
  })

  it('transitions between overview, free, floor, and stepFloor', () => {
    const store = useViewStore.getState()
    store.focusFloor('cs')
    expect(useViewStore.getState().mode).toBe('floor')
    expect(useViewStore.getState().focusedFloorKey).toBe('cs')

    store.stepFloor(1, seedFloorKeys)
    expect(useViewStore.getState().focusedFloorKey).toBe('marketing')

    store.stepFloor(-1, seedFloorKeys)
    expect(useViewStore.getState().focusedFloorKey).toBe('cs')

    // Clamps at bounds
    store.focusFloor('lobby_cafe')
    store.stepFloor(-1, seedFloorKeys)
    expect(useViewStore.getState().focusedFloorKey).toBe('lobby_cafe')

    store.focusFloor('boss')
    store.stepFloor(1, seedFloorKeys)
    expect(useViewStore.getState().focusedFloorKey).toBe('boss')

    store.setFree()
    expect(useViewStore.getState().mode).toBe('free')

    store.setOverview()
    expect(useViewStore.getState().mode).toBe('overview')
    expect(useViewStore.getState().focusedFloorKey).toBeNull()
  })

  it('R11: ensureValidFloor falls back to overview if focused floor disappears from config', () => {
    useViewStore.getState().focusFloor('design')
    expect(useViewStore.getState().mode).toBe('floor')

    const remainingKeys = seedFloorKeys.filter((k) => k !== 'design')
    useViewStore.getState().ensureValidFloor(remainingKeys)

    expect(useViewStore.getState().mode).toBe('overview')
    expect(useViewStore.getState().focusedFloorKey).toBeNull()
  })

  it('computes floor fade target for floors above the active floor', () => {
    expect(getFloorFadeTarget(2, null)).toEqual({
      opacity: 1,
      faded: false,
      castShadow: true,
    })
    expect(getFloorFadeTarget(2, 2)).toEqual({
      opacity: 1,
      faded: false,
      castShadow: true,
    })
    expect(getFloorFadeTarget(3, 2)).toEqual({
      opacity: 0.15,
      faded: true,
      castShadow: false,
    })
  })
})

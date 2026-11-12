import { create } from 'zustand'

export type CameraMode = 'overview' | 'free' | 'floor'

export interface ViewState {
  mode: CameraMode
  focusedFloorKey: string | null
  hoveredFloorKey: string | null
  setOverview: () => void
  setFree: () => void
  focusFloor: (floorKey: string) => void
  stepFloor: (delta: -1 | 1, floorKeys: readonly string[]) => void
  setHoveredFloor: (floorKey: string | null) => void
  syncFromUrl: (
    search: string,
    validFloorKeys?: ReadonlySet<string> | readonly string[],
  ) => void
  ensureValidFloor: (validFloorKeys: ReadonlySet<string> | readonly string[]) => void
}

function toKeySet(
  keys?: ReadonlySet<string> | readonly string[],
): ReadonlySet<string> | null {
  if (!keys) return null
  if (keys instanceof Set) return keys
  return new Set(keys)
}

export function parseViewSearch(
  search: string,
  validFloorKeys?: ReadonlySet<string> | readonly string[],
): { mode: CameraMode; focusedFloorKey: string | null } {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const cam = params.get('cam')
  const floor = params.get('floor')

  if (cam === 'free') {
    return { mode: 'free', focusedFloorKey: null }
  }

  if (cam === 'floor' && floor && floor.trim().length > 0) {
    const keySet = toKeySet(validFloorKeys)
    if (keySet && keySet.size > 0 && !keySet.has(floor)) {
      return { mode: 'overview', focusedFloorKey: null }
    }
    return { mode: 'floor', focusedFloorKey: floor }
  }

  return { mode: 'overview', focusedFloorKey: null }
}

export function serializeViewSearch(
  mode: CameraMode,
  focusedFloorKey: string | null,
  baseSearch = '',
): string {
  const params = new URLSearchParams(
    baseSearch.startsWith('?') ? baseSearch.slice(1) : baseSearch,
  )
  params.delete('cam')
  params.delete('floor')
  if (mode === 'floor' && focusedFloorKey) {
    params.set('cam', 'floor')
    params.set('floor', focusedFloorKey)
  } else if (mode === 'free') {
    params.set('cam', 'free')
  } else {
    params.set('cam', 'overview')
  }
  return `?${params.toString()}`
}

/**
 * Shared floor fade target selector used by Floor.tsx and P04's follow camera mode.
 * Floors above the active/focused floor fade to 15% opacity and stop casting shadows.
 */
export function getFloorFadeTarget(
  floorIndex: number,
  activeFloorIndex: number | null,
): { opacity: number; faded: boolean; castShadow: boolean } {
  if (activeFloorIndex !== null && floorIndex > activeFloorIndex) {
    // Only the floor right above stays as a faint ghost. Ghosts stacked over
    // several floors add up to an almost solid layer that hides the people at
    // the back of the focused floor while their labels still draw on top.
    const opacity = floorIndex === activeFloorIndex + 1 ? 0.15 : 0
    return { opacity, faded: true, castShadow: false }
  }
  return { opacity: 1, faded: false, castShadow: true }
}

export const useViewStore = create<ViewState>((set, get) => ({
  mode: 'overview',
  focusedFloorKey: null,
  hoveredFloorKey: null,

  setOverview: () => {
    set({ mode: 'overview', focusedFloorKey: null })
  },

  setFree: () => {
    set({ mode: 'free' })
  },

  focusFloor: (floorKey: string) => {
    set({ mode: 'floor', focusedFloorKey: floorKey })
  },

  stepFloor: (delta: -1 | 1, floorKeys: readonly string[]) => {
    if (floorKeys.length === 0) return
    const { mode, focusedFloorKey } = get()
    if (mode !== 'floor' || !focusedFloorKey) {
      const targetKey = delta === 1 ? floorKeys[0]! : floorKeys[floorKeys.length - 1]!
      set({ mode: 'floor', focusedFloorKey: targetKey })
      return
    }
    const currentIdx = floorKeys.indexOf(focusedFloorKey)
    if (currentIdx === -1) {
      set({ mode: 'floor', focusedFloorKey: floorKeys[0]! })
      return
    }
    const nextIdx = Math.max(0, Math.min(floorKeys.length - 1, currentIdx + delta))
    set({ mode: 'floor', focusedFloorKey: floorKeys[nextIdx]! })
  },

  setHoveredFloor: (floorKey: string | null) => {
    if (get().hoveredFloorKey !== floorKey) {
      set({ hoveredFloorKey: floorKey })
    }
  },

  syncFromUrl: (search, validFloorKeys) => {
    const next = parseViewSearch(search, validFloorKeys)
    const curr = get()
    if (curr.mode !== next.mode || curr.focusedFloorKey !== next.focusedFloorKey) {
      set({ mode: next.mode, focusedFloorKey: next.focusedFloorKey })
    }
  },

  ensureValidFloor: (validFloorKeys) => {
    const { mode, focusedFloorKey } = get()
    if (mode !== 'floor' || !focusedFloorKey) return
    const keySet = toKeySet(validFloorKeys)
    if (keySet && keySet.size > 0 && !keySet.has(focusedFloorKey)) {
      set({ mode: 'overview', focusedFloorKey: null })
    }
  },
}))

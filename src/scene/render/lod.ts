import { visualLanguage } from '@/office/visualConfig'

/** Label level of detail (P05 §3.6, R12). */
export type LodBand = 'near' | 'mid' | 'far'

export interface LodThresholds {
  nearMax: number
  midMax: number
  /** Share of a threshold to cross before switching (0.1 = 10 %). */
  hysteresis: number
}

const DEFAULT: LodThresholds = visualLanguage.lod

/**
 * Band for a camera distance (m to the floor centre). With `prev`, a band
 * only changes after crossing its threshold by `hysteresis`, so it does not
 * flicker while the camera rests on a boundary.
 */
export function lodBand(distance: number, prev: LodBand | null = null, t: LodThresholds = DEFAULT): LodBand {
  const h = t.hysteresis
  if (prev === null) return distance <= t.nearMax ? 'near' : distance <= t.midMax ? 'mid' : 'far'
  switch (prev) {
    case 'near':
      if (distance <= t.nearMax * (1 + h)) return 'near'
      return distance <= t.midMax ? 'mid' : 'far'
    case 'mid':
      if (distance < t.nearMax * (1 - h)) return 'near'
      if (distance > t.midMax * (1 + h)) return 'far'
      return 'mid'
    case 'far':
      if (distance >= t.midMax * (1 - h)) return 'far'
      return distance <= t.nearMax ? 'near' : 'mid'
  }
}

export interface LodOverride {
  mode: string
  focusedFloorIndex: number | null
  followedFloorIndex: number | null
}

/**
 * Camera modes override distance: floor focus → near for the focused floor
 * and far for the rest; follow → near for the followed person's floor.
 */
export function overrideBand(floorIndex: number, band: LodBand, o: LodOverride): LodBand {
  if (o.mode === 'floor' && o.focusedFloorIndex !== null) {
    return floorIndex === o.focusedFloorIndex ? 'near' : 'far'
  }
  if (o.mode === 'follow' && o.followedFloorIndex !== null && floorIndex === o.followedFloorIndex) {
    return 'near'
  }
  return band
}

/**
 * Bands per floor index for this frame. Written once per frame by
 * `<People>` (the only component that knows the camera, floors and
 * followed person together), read by every LOD-aware layer. Not React
 * state.
 */
export const lodRuntime: { bands: LodBand[] } = { bands: [] }

export function bandOf(floorIndex: number): LodBand {
  return lodRuntime.bands[floorIndex] ?? 'mid'
}

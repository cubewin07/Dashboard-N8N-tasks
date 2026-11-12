import { create } from 'zustand'
import { visualLanguage } from './visualConfig'

/**
 * Per-browser view preferences (P05-T14): "Giảm chuyển động" and the
 * day/night lighting toggle. Stored in localStorage; reduced motion
 * defaults from `prefers-reduced-motion` until the boss picks a value.
 */
export interface OfficePrefs {
  /** null = follow the operating system setting. */
  reducedMotionChoice: boolean | null
  /** The OS `prefers-reduced-motion` value (kept live). */
  systemReducedMotion: boolean
  dayNight: boolean
  setReducedMotion: (value: boolean | null) => void
  setDayNight: (value: boolean) => void
}

export const PREFS_STORAGE_KEY = 'office.prefs.v1'

interface Stored {
  reducedMotion?: boolean | null
  dayNight?: boolean
}

function readStored(): Stored {
  try {
    const raw = globalThis.localStorage?.getItem(PREFS_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const obj = parsed as Record<string, unknown>
    return {
      reducedMotion: typeof obj.reducedMotion === 'boolean' ? obj.reducedMotion : null,
      dayNight: typeof obj.dayNight === 'boolean' ? obj.dayNight : undefined,
    }
  } catch {
    return {}
  }
}

function writeStored(s: Stored): void {
  try {
    globalThis.localStorage?.setItem(PREFS_STORAGE_KEY, JSON.stringify(s))
  } catch {
    // Private mode / quota: the preference just does not persist.
  }
}

function systemPrefersReduced(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const stored = readStored()

export const useOfficePrefs = create<OfficePrefs>((set, get) => ({
  reducedMotionChoice: stored.reducedMotion ?? null,
  systemReducedMotion: systemPrefersReduced(),
  dayNight: stored.dayNight ?? visualLanguage.dayNight.enabledByDefault,
  setReducedMotion: (value) => {
    set({ reducedMotionChoice: value })
    writeStored({ reducedMotion: value, dayNight: get().dayNight })
  },
  setDayNight: (value) => {
    set({ dayNight: value })
    writeStored({ reducedMotion: get().reducedMotionChoice, dayNight: value })
  },
}))

if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener?.('change', (e) => useOfficePrefs.setState({ systemReducedMotion: e.matches }))
}

/** Effective reduced-motion flag (R14). */
export function selectReducedMotion(s: OfficePrefs): boolean {
  return s.reducedMotionChoice ?? s.systemReducedMotion
}

export function useReducedMotionPref(): boolean {
  return useOfficePrefs(selectReducedMotion)
}

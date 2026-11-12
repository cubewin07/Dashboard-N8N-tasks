/**
 * P05-T12 pure time helpers for decorative life: wall clock hands and the
 * day/night light factor, both in office local time (Asia/Ho_Chi_Minh,
 * UTC+7 all year, no DST) from feed time.
 */

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MINUTES = 24 * 60
const TWO_PI = Math.PI * 2

/** Minutes since local midnight (fractional) for an ISO instant or epoch ms. */
export function localMinutes(at: string | number): number {
  const ms = typeof at === 'number' ? at : Date.parse(at)
  if (!Number.isFinite(ms)) return 0
  const dayMs = 24 * 60 * 60 * 1000
  const local = (((ms + ICT_OFFSET_MS) % dayMs) + dayMs) % dayMs
  return local / 60000
}

export interface ClockAngles {
  /** Clockwise from 12 o'clock, radians in [0, 2π). */
  hour: number
  minute: number
}

/** Hand angles of an analogue wall clock showing local time. */
export function clockAngles(at: string | number): ClockAngles {
  const minutes = localMinutes(at)
  const hour12 = (minutes / 60) % 12
  return {
    hour: (hour12 / 12) * TWO_PI,
    minute: ((minutes % 60) / 60) * TWO_PI,
  }
}

/** "HH:MM" → minutes since midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export interface DayLight {
  /** 1 = full day, 0 = night. */
  daylight: number
  /** 0..1, peaks around dawn and dusk (warm sun colour). */
  warmth: number
}

/** Full daylight at noon: what lighting shows with day/night off. */
export const NOON: DayLight = { daylight: 1, warmth: 0 }

/**
 * Light factor for a local time. Daylight ramps over `rampMinutes`
 * centred on dawn and dusk; warmth is highest at the two turning points.
 */
export function dayLight(minutes: number, dawn: string, dusk: string, rampMinutes = 60): DayLight {
  const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  const up = hhmmToMinutes(dawn)
  const down = hhmmToMinutes(dusk)
  const half = rampMinutes / 2
  const rise = smoothstep(up - half, up + half, m)
  const set = 1 - smoothstep(down - half, down + half, m)
  const daylight = Math.min(rise, set)
  const near = Math.min(Math.abs(m - up), Math.abs(m - down))
  const warmth = Math.max(0, 1 - near / rampMinutes)
  return { daylight, warmth }
}

/** Night for the cat's floor switch: before dawn or after dusk. */
export function isNight(minutes: number, dawn: string, dusk: string): boolean {
  const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return m < hhmmToMinutes(dawn) || m >= hhmmToMinutes(dusk)
}

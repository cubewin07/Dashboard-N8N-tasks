import type { Department, Policy } from '@/domain/config'
import type { Iso } from '@/domain/primitives'

export type SimSpeed = 0 | 1 | 30 | 120

// 2026-11-02T01:00:00.000Z is Monday 08:00:00 ICT (UTC+7)
export const DEFAULT_SIM_START_ISO: Iso = '2026-11-02T01:00:00.000Z'
export const DEFAULT_SIM_START_MS = Date.parse(DEFAULT_SIM_START_ISO)
const ICT_OFFSET_MS = 7 * 3600_000

function parseHhMm(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr ?? 0)
  const m = Number(mStr ?? 0)
  return h * 60 + m
}

export class SimClock {
  private currentMs: number
  public speed: SimSpeed

  constructor(
    initialIsoOrMs: string | number = DEFAULT_SIM_START_MS,
    initialSpeed: SimSpeed = 30,
  ) {
    this.currentMs =
      typeof initialIsoOrMs === 'number'
        ? initialIsoOrMs
        : Date.parse(initialIsoOrMs)
    this.speed = initialSpeed
  }

  now(): Iso {
    return new Date(this.currentMs).toISOString()
  }

  nowMs(): number {
    return this.currentMs
  }

  setNow(isoOrMs: string | number): void {
    this.currentMs =
      typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs)
  }

  setSpeed(speed: SimSpeed): void {
    this.speed = speed
  }

  advance(realDtMs: number): number {
    if (this.speed === 0 || realDtMs <= 0) {
      return 0
    }
    const simDtMs = realDtMs * this.speed
    this.currentMs += simDtMs
    return simDtMs
  }

  advanceSimMs(simDtMs: number): void {
    if (simDtMs <= 0) return
    this.currentMs += simDtMs
  }

  getIctParts(): {
    year: number
    month: number
    day: number
    dayOfWeek: number
    hours: number
    minutes: number
    minutesOfDay: number
  } {
    const d = new Date(this.currentMs + ICT_OFFSET_MS)
    const hours = d.getUTCHours()
    const minutes = d.getUTCMinutes()
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      dayOfWeek: d.getUTCDay(),
      hours,
      minutes,
      minutesOfDay: hours * 60 + minutes,
    }
  }

  isLunch(policy: Policy): boolean {
    const { minutesOfDay } = this.getIctParts()
    const startMin = parseHhMm(policy.calendar.lunch[0])
    const endMin = parseHhMm(policy.calendar.lunch[1])
    return minutesOfDay >= startMin && minutesOfDay < endMin
  }

  isWorkHours(
    dept: Pick<Department, 'hours'> | null | undefined,
    policy: Policy,
  ): boolean {
    if (!dept || dept.hours === '24_7') {
      return true
    }
    const { dayOfWeek, minutesOfDay } = this.getIctParts()
    // Sunday is off for office departments
    if (dayOfWeek === 0) {
      return false
    }
    const startMin = parseHhMm(policy.calendar.workStart)
    const endMin = parseHhMm(policy.calendar.workEnd)
    return minutesOfDay >= startMin && minutesOfDay < endMin
  }

  isMonthEnd(): boolean {
    const { year, month, day } = this.getIctParts()
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return day >= daysInMonth - 2
  }

  isQuarterEnd(): boolean {
    const { month } = this.getIctParts()
    return (
      this.isMonthEnd() &&
      (month === 3 || month === 6 || month === 9 || month === 12)
    )
  }
}

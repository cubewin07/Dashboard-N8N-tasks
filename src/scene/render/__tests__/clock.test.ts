import { describe, expect, it } from 'vitest'
import { clockAngles, dayLight, hhmmToMinutes, isNight, localMinutes } from '../clock'

describe('clockAngles (P05-T12)', () => {
  it('shows Asia/Ho_Chi_Minh local time from a UTC instant', () => {
    // 05:00Z = 12:00 in Ho Chi Minh City.
    const noon = clockAngles('2026-03-02T05:00:00.000Z')
    expect(noon.hour).toBeCloseTo(0)
    expect(noon.minute).toBeCloseTo(0)
    // 08:30Z = 15:30 local: hour hand between 3 and 4, minute hand at 6.
    const a = clockAngles('2026-03-02T08:30:00.000Z')
    expect(a.minute).toBeCloseTo(Math.PI)
    expect(a.hour).toBeCloseTo((3.5 / 12) * Math.PI * 2)
  })

  it('wraps across local midnight', () => {
    // 17:15Z = 00:15 next day local.
    expect(localMinutes('2026-03-02T17:15:00.000Z')).toBeCloseTo(15)
    const a = clockAngles(Date.parse('2026-03-02T17:15:00.000Z'))
    expect(a.minute).toBeCloseTo(Math.PI / 2)
    expect(a.hour).toBeCloseTo((0.25 / 12) * Math.PI * 2)
  })
})

describe('dayLight', () => {
  it('is full day at noon, night at midnight and ramps at dawn/dusk', () => {
    expect(dayLight(hhmmToMinutes('12:00'), '06:00', '18:30')).toEqual({ daylight: 1, warmth: 0 })
    expect(dayLight(0, '06:00', '18:30').daylight).toBe(0)
    const dawn = dayLight(hhmmToMinutes('06:00'), '06:00', '18:30')
    expect(dawn.daylight).toBeCloseTo(0.5)
    expect(dawn.warmth).toBe(1)
    expect(dayLight(hhmmToMinutes('18:30'), '06:00', '18:30').daylight).toBeCloseTo(0.5)
    expect(dayLight(hhmmToMinutes('21:00'), '06:00', '18:30').daylight).toBe(0)
  })

  it('tells night from day', () => {
    expect(isNight(hhmmToMinutes('05:59'), '06:00', '18:30')).toBe(true)
    expect(isNight(hhmmToMinutes('06:00'), '06:00', '18:30')).toBe(false)
    expect(isNight(hhmmToMinutes('18:30'), '06:00', '18:30')).toBe(true)
  })
})

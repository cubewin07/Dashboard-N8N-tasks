import { describe, expect, it } from 'vitest'
import { seedConfig } from '@/office/configStore'
import {
  NUMBER_FIELDS,
  TIME_FIELDS,
  crossFieldErrors,
  isPolicyDirty,
  isPolicyValid,
  isValidNumber,
  resetNumberField,
  resetTimeField,
} from '../model'

const seed = seedConfig().policy
const field = (id: string) => NUMBER_FIELDS.find((f) => f.id === id)!

describe('policy fields', () => {
  it('reads the seed value of every numeric field and the seed is valid', () => {
    expect(field('tempCap').get(seed)).toBe(10)
    expect(field('weightUrgent').get(seed)).toBe(400)
    expect(isPolicyValid(seed)).toBe(true)
    expect(NUMBER_FIELDS.every((f) => isValidNumber(f, f.get(seed)))).toBe(true)
  })

  it('reset-to-default restores the seed value of one field only', () => {
    const tempCap = field('tempCap')
    const edited = field('helpMaxRounds').set(tempCap.set(seed, 4), 3)
    expect(tempCap.get(edited)).toBe(4)
    const reset = resetNumberField(edited, seed, tempCap)
    expect(tempCap.get(reset)).toBe(10)
    expect(field('helpMaxRounds').get(reset)).toBe(3)
    expect(isPolicyDirty(reset, seed)).toBe(true)
    expect(isPolicyDirty(resetNumberField(reset, seed, field('helpMaxRounds')), seed)).toBe(false)
  })

  it('resets time fields too', () => {
    const start = TIME_FIELDS.find((f) => f.id === 'workStart')!
    const edited = start.set(seed, '09:00')
    expect(resetTimeField(edited, seed, start)).toEqual(seed)
  })

  it('enforces the range and whole numbers', () => {
    const tempCap = field('tempCap')
    expect(isValidNumber(tempCap, 50)).toBe(true)
    expect(isValidNumber(tempCap, 51)).toBe(false)
    expect(isValidNumber(tempCap, -1)).toBe(false)
    expect(isValidNumber(tempCap, 2.5)).toBe(false)
    expect(isValidNumber(tempCap, Number.NaN)).toBe(false)
    expect(isValidNumber(field('helpMaxRounds'), 0)).toBe(false)
    expect(isValidNumber(field('helpTimeoutMinutes'), 4)).toBe(false)
    expect(isPolicyValid(tempCap.set(seed, Number.NaN))).toBe(false)
  })

  it('needs weights strictly ordered and a sane day', () => {
    expect(crossFieldErrors(field('weightHigh').set(seed, 450))).toContain('weightOrder')
    expect(crossFieldErrors({ ...seed, calendar: { ...seed.calendar, workEnd: '07:00' } })).toContain('workHours')
    expect(crossFieldErrors({ ...seed, calendar: { ...seed.calendar, lunch: ['13:00', '12:00'] } })).toContain(
      'lunchOrder',
    )
    expect(crossFieldErrors({ ...seed, calendar: { ...seed.calendar, lunch: ['07:00', '08:00'] } })).toContain(
      'lunchInside',
    )
    expect(crossFieldErrors(seed)).toEqual([])
  })
})

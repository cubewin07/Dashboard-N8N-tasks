import { describe, expect, it } from 'vitest'
import { VISUAL_STATUS_KEYS } from '@/domain/visual'
import type { PersonActivity } from '@/domain/work'
import { visualLanguage } from '@/office/visualConfig'
import { statusLook } from '../statusLook'

const ALL: PersonActivity[] = [
  'idle',
  'working',
  'reviewing',
  'delivering',
  'asking',
  'waiting_answer',
  'helping',
  'in_meeting',
  'resting',
  'off_shift',
]

describe('statusLook', () => {
  it('gives idle, resting and off-shift people no status (R2)', () => {
    for (const a of ['idle', 'resting', 'off_shift'] as const) {
      expect(statusLook(a, false)).toBeNull()
      expect(statusLook(a, true)).toBeNull()
    }
  })

  it('a blocked task reads as blocked', () => {
    expect(statusLook('working', true)).toBe('blocked')
    expect(statusLook('reviewing', true)).toBe('blocked')
  })

  it('every other activity maps to its own look, which exists in visual-language.json', () => {
    for (const a of ALL) {
      const key = statusLook(a, false)
      if (key === null) continue
      expect(key).toBe(a)
      expect(VISUAL_STATUS_KEYS).toContain(key)
      expect(visualLanguage.status[key]).toBeDefined()
    }
  })

  it('working people get a steady ring and an icon; idle-ish never do (R1)', () => {
    const working = visualLanguage.status[statusLook('working', false)!]
    expect(working.ring).toBe(true)
    expect(working.ringPulse).toBe(false)
    expect(working.icon).not.toBeNull()
    expect(visualLanguage.status.blocked.ringPulse).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { newId } from '@/domain/ids'
import { CommandIdSchema } from '@/domain/primitives'
import { wallUlid } from './ulid'

describe('wallUlid', () => {
  it('is 26 Crockford characters and sorts by time', () => {
    const a = wallUlid(1_700_000_000_000)
    const b = wallUlid(1_700_000_001_000)
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(a.slice(0, 10) < b.slice(0, 10)).toBe(true)
  })

  it('does not repeat within one millisecond, or restart after a reload', () => {
    const ids = new Set(Array.from({ length: 500 }, () => wallUlid(1_700_000_000_000)))
    expect(ids.size).toBe(500)
  })

  it('makes valid command ids', () => {
    expect(CommandIdSchema.safeParse(newId('cmd', wallUlid)).success).toBe(true)
  })
})

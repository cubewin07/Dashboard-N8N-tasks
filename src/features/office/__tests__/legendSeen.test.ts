import { describe, expect, it } from 'vitest'
import { hasSeenLegend, legendSeenKey, markLegendSeen, shouldAutoOpenLegend } from '../legendSeen'

function memoryStorage() {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) }
}

describe('legend first run', () => {
  it('is remembered per user', () => {
    const store = memoryStorage()
    expect(hasSeenLegend('u1', store)).toBe(false)
    markLegendSeen('u1', store)
    expect(hasSeenLegend('u1', store)).toBe(true)
    expect(hasSeenLegend('u2', store)).toBe(false)
    expect(legendSeenKey('u1')).toBe('office.legendSeen.v1:u1')
  })

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(hasSeenLegend('u1', broken)).toBe(false)
    expect(() => markLegendSeen('u1', broken)).not.toThrow()
  })

  it('stays shut without a user, and in E2E builds unless asked', () => {
    expect(shouldAutoOpenLegend(null, false, false)).toBe(false)
    expect(shouldAutoOpenLegend('fresh-user', true, false)).toBe(false)
  })
})

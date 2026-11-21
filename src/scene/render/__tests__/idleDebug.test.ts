import { describe, expect, it } from 'vitest'
import { isIdleDebugHash } from '@/scene/dev/idleDebug'

describe('isIdleDebugHash', () => {
  it('matches the office with debug=idle only', () => {
    expect(isIdleDebugHash('#/?debug=idle')).toBe(true)
    expect(isIdleDebugHash('#/office?debug=idle')).toBe(true)
    expect(isIdleDebugHash('#/?cam=overview&debug=idle')).toBe(true)
    expect(isIdleDebugHash('#/?debug=1')).toBe(false)
    expect(isIdleDebugHash('#/org?debug=idle')).toBe(false)
    expect(isIdleDebugHash('#/')).toBe(false)
  })
})

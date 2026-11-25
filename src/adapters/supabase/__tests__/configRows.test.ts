import { describe, expect, it } from 'vitest'
import { getBundledRawConfig } from '@/adapters/local/LocalConfigSource'
import { parseOrgConfig } from '@/domain/config'
import { mapRows, toRows } from '../configRows'

describe('configRows', () => {
  it('round-trips the bundled seed', () => {
    const raw = getBundledRawConfig()
    const bundled = parseOrgConfig(raw)
    const mapped = mapRows(toRows(raw))
    const cfg = parseOrgConfig({ ...raw, ...mapped })
    expect(cfg).toEqual(bundled)
  })

  it('omits policy when no row exists', () => {
    const rows = toRows(getBundledRawConfig())
    rows.policy = []
    expect(mapRows(rows).policy).toBeUndefined()
  })

  it('sorts departments and rules by order', () => {
    const rows = toRows(getBundledRawConfig())
    rows.departments.reverse()
    rows.approval_rules.reverse()
    const m = mapRows(rows) as { departments: { order: number }[]; approvalRules: { order: number }[] }
    const sorted = (a: { order: number }[]) => a.every((x, i) => i === 0 || a[i - 1].order <= x.order)
    expect(sorted(m.departments)).toBe(true)
    expect(sorted(m.approvalRules)).toBe(true)
  })
})

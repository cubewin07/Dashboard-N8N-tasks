import { describe, expect, it } from 'vitest'
import { diffPaths, formatValue, jsonEqual } from '../diff'

describe('history diff (P10-T14)', () => {
  it('returns nothing for equal values, whatever the key order', () => {
    expect(diffPaths({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toEqual([])
    expect(diffPaths(5, 5)).toEqual([])
  })

  it('reports changed nested paths with dotted names', () => {
    const out = diffPaths(
      { label: { vi: 'Kho', en: 'Store' }, active: true, order: 1 },
      { label: { vi: 'Kho vận', en: 'Store' }, active: false, order: 1 },
    )
    expect(out).toEqual([
      { path: 'label.vi', before: 'Kho', after: 'Kho vận', kind: 'changed' },
      { path: 'active', before: true, after: false, kind: 'changed' },
    ])
  })

  it('reports added and removed keys', () => {
    const out = diffPaths({ a: 1, gone: 'x' }, { a: 1, fresh: 'y' })
    expect(out).toContainEqual({ path: 'gone', before: 'x', after: undefined, kind: 'removed' })
    expect(out).toContainEqual({ path: 'fresh', before: undefined, after: 'y', kind: 'added' })
    expect(out).toHaveLength(2)
  })

  it('treats arrays as leaves: one row with the whole before and after list', () => {
    const out = diffPaths({ when: { tagsAny: ['tax'] } }, { when: { tagsAny: ['tax', 'legal'] } })
    expect(out).toEqual([
      { path: 'when.tagsAny', before: ['tax'], after: ['tax', 'legal'], kind: 'changed' },
    ])
  })

  it('handles scalars at the root and a type change', () => {
    expect(diffPaths(1, 2)).toEqual([{ path: '', before: 1, after: 2, kind: 'changed' }])
    expect(diffPaths({ a: 1 }, [1])).toEqual([{ path: '', before: { a: 1 }, after: [1], kind: 'changed' }])
  })

  it('jsonEqual compares deeply', () => {
    expect(jsonEqual([{ a: 1 }], [{ a: 1 }])).toBe(true)
    expect(jsonEqual([{ a: 1 }], [{ a: 2 }])).toBe(false)
    expect(jsonEqual([1], [1, 2])).toBe(false)
    expect(jsonEqual(null, undefined)).toBe(false)
  })

  it('formatValue shows strings raw, empties as the placeholder, the rest as JSON', () => {
    expect(formatValue('abc', '-')).toBe('abc')
    expect(formatValue(undefined, '-')).toBe('-')
    expect(formatValue(null, '-')).toBe('-')
    expect(formatValue('', '-')).toBe('-')
    expect(formatValue(false, '-')).toBe('false')
    expect(formatValue(['a'], '-')).toBe('["a"]')
  })
})

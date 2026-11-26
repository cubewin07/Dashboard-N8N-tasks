// P10-T14 · A small structural diff for history rows: which paths changed, before → after.
export interface DiffEntry {
  /** Dotted path, e.g. "label.vi" or "when.tagsAny". "" for a changed root value. */
  path: string
  before: unknown
  after: unknown
  kind: 'added' | 'removed' | 'changed'
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Deep equality for JSON-like values (key order does not matter). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) if (!jsonEqual(a[k], b[k])) return false
    return true
  }
  return false
}

/**
 * Paths whose value differs. Objects are walked key by key; arrays and scalars are leaves, so a
 * changed list shows as one row with the whole before and after list.
 */
export function diffPaths(before: unknown, after: unknown, prefix = ''): DiffEntry[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    return keys.flatMap((key) => {
      const path = prefix === '' ? key : `${prefix}.${key}`
      const inBefore = key in before && before[key] !== undefined
      const inAfter = key in after && after[key] !== undefined
      if (!inBefore && inAfter) return [{ path, before: undefined, after: after[key], kind: 'added' as const }]
      if (inBefore && !inAfter) return [{ path, before: before[key], after: undefined, kind: 'removed' as const }]
      return diffPaths(before[key], after[key], path)
    })
  }
  if (jsonEqual(before, after)) return []
  return [{ path: prefix, before, after, kind: 'changed' }]
}

/** Short text for one value in a diff row. Strings stay as they are, the rest is compact JSON. */
export function formatValue(value: unknown, empty: string): string {
  if (value === undefined || value === null || value === '') return empty
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

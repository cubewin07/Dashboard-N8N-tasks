// P10-T15 · "What would this import change?": per collection, which items are added, changed, removed.
import type { OrgConfig } from '@/domain/config'
import { jsonEqual, diffPaths, type DiffEntry } from '../history/diff'

export const DIFF_COLLECTIONS = [
  'departments',
  'roles',
  'specialties',
  'employees',
  'shops',
  'platforms',
  'approvalRules',
  'taskTypes',
] as const

export type DiffCollection = (typeof DIFF_COLLECTIONS)[number]

export interface CollectionDiff {
  collection: DiffCollection
  added: string[]
  changed: string[]
  removed: string[]
}

export interface ImportDiff {
  collections: CollectionDiff[]
  policy: DiffEntry[]
  /** True when applying would change nothing. */
  empty: boolean
}

interface Row {
  key: string
  name: string
  value: unknown
}

function rows(config: OrgConfig, collection: DiffCollection): Row[] {
  const lang = (l: { vi: string }) => l.vi
  switch (collection) {
    case 'departments':
      return config.departments.map((x) => ({ key: x.id, name: lang(x.label), value: x }))
    case 'roles':
      return config.roles.map((x) => ({ key: x.key, name: lang(x.label), value: x }))
    case 'specialties':
      return config.specialties.map((x) => ({ key: x.key, name: lang(x.label), value: x }))
    case 'employees':
      return config.employees.map((x) => ({ key: x.id, name: x.name, value: x }))
    case 'shops':
      return config.shops.map((x) => ({ key: x.id, name: x.name, value: x }))
    case 'platforms':
      return config.platforms.map((x) => ({ key: x.key, name: lang(x.label), value: x }))
    case 'approvalRules':
      return config.approvalRules.map((x) => ({ key: x.id, name: lang(x.label), value: x }))
    case 'taskTypes':
      return config.taskTypes.map((x) => ({ key: x.key, name: lang(x.label), value: x }))
  }
}

/** Compare what an import would write (`next`, after `config.replace`) with the `current` config. */
export function summarizeImport(current: OrgConfig, next: OrgConfig): ImportDiff {
  const collections = DIFF_COLLECTIONS.map((collection): CollectionDiff => {
    const before = new Map(rows(current, collection).map((r) => [r.key, r]))
    const after = new Map(rows(next, collection).map((r) => [r.key, r]))
    const added: string[] = []
    const changed: string[] = []
    const removed: string[] = []
    for (const [key, row] of after) {
      const old = before.get(key)
      if (!old) added.push(row.name)
      else if (!jsonEqual(old.value, row.value)) changed.push(row.name)
    }
    for (const [key, row] of before) if (!after.has(key)) removed.push(row.name)
    return { collection, added, changed, removed }
  })
  const policy = diffPaths(current.policy, next.policy)
  const empty = policy.length === 0 && collections.every((c) => c.added.length + c.changed.length + c.removed.length === 0)
  return { collections, policy, empty }
}

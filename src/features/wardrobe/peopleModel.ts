/** Pure model behind the wardrobe people picker (R1): who can be dressed, grouped and filtered. */
import type { OrgConfig } from '@/domain/config'
import type { Label } from '@/domain/primitives'
import { foldText } from '@/features/office/peopleListModel'

export interface WardrobePerson {
  id: string
  name: string
  roleLabel: Label
  departmentKey: string | null
  departmentLabel: Label | null
  owner: boolean
  archived: boolean
}

export interface WardrobePeopleFilter {
  query: string
  /** Department key, or `null` for every department. Owners ignore the department filter. */
  departmentKey: string | null
  showArchived: boolean
}

export const ALL_DEPARTMENTS = null

/** Everyone in the config, owners first, then by department order, role order and name. */
export function buildWardrobePeople(config: OrgConfig): WardrobePerson[] {
  const roles = new Map(config.roles.map((r) => [r.key, r]))
  const depts = new Map(config.departments.map((d) => [d.id, d]))
  const people = config.employees.map((e) => {
    const role = roles.get(e.roleKey)
    const dept = e.departmentId ? depts.get(e.departmentId) : undefined
    return {
      person: {
        id: e.id,
        name: e.name,
        roleLabel: role?.label ?? { vi: e.roleKey, en: e.roleKey },
        departmentKey: dept?.key ?? null,
        departmentLabel: dept?.label ?? null,
        owner: role?.caps.humanOwner === true,
        archived: e.state === 'archived',
      } satisfies WardrobePerson,
      deptOrder: dept?.order ?? -1,
      roleOrder: role?.sortOrder ?? 0,
    }
  })
  people.sort(
    (a, b) =>
      Number(b.person.owner) - Number(a.person.owner) ||
      a.deptOrder - b.deptOrder ||
      a.roleOrder - b.roleOrder ||
      a.person.name.localeCompare(b.person.name, 'vi'),
  )
  return people.map((p) => p.person)
}

export function filterWardrobePeople(
  people: readonly WardrobePerson[],
  filter: WardrobePeopleFilter,
): WardrobePerson[] {
  const q = foldText(filter.query)
  return people.filter((p) => {
    if (p.archived && !filter.showArchived) return false
    if (filter.departmentKey !== null && !p.owner && p.departmentKey !== filter.departmentKey) return false
    if (q && !foldText(p.name).includes(q)) return false
    return true
  })
}

/** Next index for arrow / Home / End navigation (wraps never; clamps). `-1` = nothing focused yet. */
export function nextIndex(current: number, key: string, count: number): number {
  if (count === 0) return -1
  switch (key) {
    case 'ArrowDown':
      return Math.min(current + 1, count - 1)
    case 'ArrowUp':
      return current < 0 ? 0 : Math.max(current - 1, 0)
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return current
  }
}

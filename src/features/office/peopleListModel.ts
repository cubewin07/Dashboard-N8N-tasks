import type { OrgConfig } from '@/domain/config'
import type { EmployeeId, Label } from '@/domain/primitives'
import { orgTree } from '@/domain/selectors'

export interface PeopleListPerson {
  id: EmployeeId
  name: string
  roleLabel: Label
  /** Label of the group (department or building-level floor) the person sits in. */
  groupLabel: Label
  /** Whether the role can approve work (shows the queue link in the drawer). */
  approver: boolean
}

export interface PeopleListGroup {
  key: string
  label: Label
  people: PeopleListPerson[]
}

const COMBINING_MARKS = /[̀-ͯ]/g

/**
 * Folds text for searching: lower case, Vietnamese diacritics removed.
 * "đ" has no canonical decomposition, so it is mapped by hand.
 */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

/**
 * Active employees grouped and ordered exactly like the org list
 * (boss floor, management, then departments; role order inside a group).
 * Groups without people are left out.
 */
export function buildPeopleGroups(config: OrgConfig): PeopleListGroup[] {
  return orgTree(config)
    .map((floor) => ({
      key: floor.floorKey,
      label: floor.label,
      people: floor.people.map((node) => ({
        id: node.employee.id,
        name: node.employee.name,
        roleLabel: node.role.label,
        groupLabel: floor.label,
        approver: node.role.caps.approveLevel !== null,
      })),
    }))
    .filter((group) => group.people.length > 0)
}

/** Keeps the people whose name contains the query, ignoring case and diacritics. */
export function filterPeopleGroups(
  groups: readonly PeopleListGroup[],
  query: string,
): PeopleListGroup[] {
  const needle = foldText(query)
  if (!needle) return [...groups]
  return groups
    .map((group) => ({
      ...group,
      people: group.people.filter((p) => foldText(p.name).includes(needle)),
    }))
    .filter((group) => group.people.length > 0)
}

export function findPerson(
  groups: readonly PeopleListGroup[],
  id: string | null,
): PeopleListPerson | null {
  if (!id) return null
  for (const group of groups) {
    const hit = group.people.find((p) => p.id === id)
    if (hit) return hit
  }
  return null
}

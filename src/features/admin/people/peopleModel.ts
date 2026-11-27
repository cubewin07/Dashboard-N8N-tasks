// Pure helpers of the People tab (P10-T07): filters, ids and the draft → Employee mapping.
import type { Department, Employee, ModelTier, OrgConfig, RoleDef, Specialty } from '@/domain/config'
import type { EmployeeId, Iso } from '@/domain/primitives'
import { slugKey, uniqueKey } from '../shared/keys'

export type KindFilter = 'all' | Employee['kind']
export type StateFilter = 'all' | Employee['state']

export interface PeopleFilters {
  /** 'all' | 'building' (no department) | a department id. */
  departmentId: string
  /** 'all' or a role key. */
  roleKey: string
  kind: KindFilter
  state: StateFilter
}

export const DEFAULT_FILTERS: PeopleFilters = {
  departmentId: 'all',
  roleKey: 'all',
  kind: 'all',
  state: 'active',
}

export const BUILDING_FILTER = 'building'

/** People matching all filters, ordered by floor, then role, then name. */
export function filterPeople(config: OrgConfig, filters: PeopleFilters): Employee[] {
  const deptOrder = new Map(config.departments.map((d) => [d.id, d.order]))
  const roleOrder = new Map(config.roles.map((r) => [r.key, r.sortOrder]))
  return config.employees
    .filter((e) => {
      if (filters.state !== 'all' && e.state !== filters.state) return false
      if (filters.kind !== 'all' && e.kind !== filters.kind) return false
      if (filters.roleKey !== 'all' && e.roleKey !== filters.roleKey) return false
      if (filters.departmentId === 'all') return true
      if (filters.departmentId === BUILDING_FILTER) return e.departmentId === null
      return e.departmentId === filters.departmentId
    })
    .sort((a, b) => {
      const da = a.departmentId === null ? -1 : (deptOrder.get(a.departmentId) ?? 999)
      const db = b.departmentId === null ? -1 : (deptOrder.get(b.departmentId) ?? 999)
      if (da !== db) return da - db
      const ra = roleOrder.get(a.roleKey) ?? 999
      const rb = roleOrder.get(b.roleKey) ?? 999
      if (ra !== rb) return ra - rb
      return a.name.localeCompare(b.name, 'vi')
    })
}

/** Archived people, most recently left first. */
export function archivedPeople(config: OrgConfig): Employee[] {
  return config.employees
    .filter((e) => e.state === 'archived')
    .sort((a, b) => (b.archivedAt ?? b.createdAt).localeCompare(a.archivedAt ?? a.createdAt))
}

/** `emp_` + slug of the name, made unique among the existing ids ("Thu" → emp_thu_2 if emp_thu exists). */
export function newEmployeeId(name: string, existingIds: Iterable<string>): EmployeeId {
  const taken = [...existingIds].map((id) => id.replace(/^emp_/, ''))
  return `emp_${uniqueKey(slugKey(name), taken)}`
}

export interface PersonDraft {
  name: string
  kind: Employee['kind']
  departmentId: string | null
  roleKey: string
  specialties: string[]
  reviewMode: Employee['reviewMode']
  modelTierOverride: ModelTier | null
}

export function blankDraft(config: OrgConfig): PersonDraft {
  const dept = [...config.departments].filter((d) => d.active).sort((a, b) => a.order - b.order)[0]
  const role =
    config.roles.find((r) => r.key === 'worker') ??
    config.roles.find((r) => r.scope === 'department' && r.caps.doWork)
  return {
    name: '',
    kind: 'core',
    departmentId: dept?.id ?? null,
    roleKey: role?.key ?? config.roles[0]?.key ?? 'worker',
    specialties: [],
    reviewMode: 'always',
    modelTierOverride: null,
  }
}

export function draftFromEmployee(e: Employee): PersonDraft {
  return {
    name: e.name,
    kind: e.kind,
    departmentId: e.departmentId,
    roleKey: e.roleKey,
    specialties: [...e.specialties],
    reviewMode: e.reviewMode,
    modelTierOverride: e.modelTierOverride,
  }
}

export function sameDraft(a: PersonDraft, b: PersonDraft): boolean {
  return (
    a.name === b.name &&
    a.kind === b.kind &&
    a.departmentId === b.departmentId &&
    a.roleKey === b.roleKey &&
    a.reviewMode === b.reviewMode &&
    a.modelTierOverride === b.modelTierOverride &&
    a.specialties.length === b.specialties.length &&
    a.specialties.every((s, i) => s === b.specialties[i])
  )
}

/**
 * The Employee a draft stands for. An existing person keeps everything the form does not edit
 * (state, bio, createdAt, archivedAt…); a hire is a new active person created by the boss.
 * Building-scope roles (manager, owner) never belong to a department.
 */
export function employeeFromDraft(
  draft: PersonDraft,
  roles: readonly RoleDef[],
  ctx: { base: Employee | null; id: EmployeeId; now: Iso },
): Employee {
  const role = roles.find((r) => r.key === draft.roleKey)
  const departmentId = role?.scope === 'building' ? null : draft.departmentId
  const edited = {
    name: draft.name.trim(),
    kind: draft.kind,
    departmentId: departmentId as Employee['departmentId'],
    roleKey: draft.roleKey,
    specialties: [...draft.specialties],
    reviewMode: draft.reviewMode,
    modelTierOverride: draft.modelTierOverride,
  }
  if (ctx.base) return { ...ctx.base, ...edited }
  return {
    id: ctx.id,
    ...edited,
    state: 'active',
    bio: null,
    createdAt: ctx.now,
    createdBy: 'boss',
    archivedAt: null,
  }
}

/** Specialties split for the picker: the department's own first, then the rest (each A→Z by key order of config). */
export function groupSpecialties(
  specialties: readonly Specialty[],
  department: Department | undefined,
): { home: Specialty[]; other: Specialty[] } {
  const home = department
    ? specialties.filter((s) => s.homeDepartmentKey === department.key)
    : []
  const homeKeys = new Set(home.map((s) => s.key))
  return { home, other: specialties.filter((s) => !homeKeys.has(s.key)) }
}

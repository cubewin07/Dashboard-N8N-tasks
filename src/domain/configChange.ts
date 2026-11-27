// P10-T01 · Typed config writes (phase-10 §3.1). Pure: no React, no Date.now().
import type { ConfigChange, OrgConfig } from './config'
import type { Iso } from './primitives'

export type { ConfigChange } from './config'

/**
 * The parts of the config the boss can edit (Quản trị) and that `config.replace` (import /
 * reset) swaps. `building`, `floorTemplates` and `palette` are developer data tied to art
 * assets (D8); a replace keeps the current ones so an import can never move the boss floor.
 */
export const EDITABLE_CONFIG_KEYS = [
  'departments',
  'roles',
  'specialties',
  'employees',
  'shops',
  'platforms',
  'approvalRules',
  'policy',
  'taskTypes',
] as const satisfies readonly (keyof OrgConfig)[]

export type EditableConfigKey = (typeof EDITABLE_CONFIG_KEYS)[number]
export type EditableConfig = Pick<OrgConfig, EditableConfigKey>

/** Built-in roles: never deleted; `scope` and `caps.humanOwner` never change (R3). */
export const BUILT_IN_ROLE_KEYS = [
  'owner',
  'manager',
  'dept_manager',
  'lead',
  'reviewer',
  'worker',
] as const

/** What may never change on a built-in role (R3). Matches src/content/roles.json. */
export const BUILT_IN_ROLES: Record<
  (typeof BUILT_IN_ROLE_KEYS)[number],
  { scope: 'building' | 'department'; humanOwner: boolean }
> = {
  owner: { scope: 'building', humanOwner: true },
  manager: { scope: 'building', humanOwner: false },
  dept_manager: { scope: 'department', humanOwner: false },
  lead: { scope: 'department', humanOwner: false },
  reviewer: { scope: 'department', humanOwner: false },
  worker: { scope: 'department', humanOwner: false },
}

export function isBuiltInRole(key: string): boolean {
  return (BUILT_IN_ROLE_KEYS as readonly string[]).includes(key)
}

export function pickEditable(config: OrgConfig): EditableConfig {
  const out = {} as Record<EditableConfigKey, unknown>
  for (const k of EDITABLE_CONFIG_KEYS) out[k] = config[k]
  return out as EditableConfig
}

function upsertBy<T>(list: readonly T[], item: T, same: (a: T) => boolean): T[] {
  return list.some(same) ? list.map((x) => (same(x) ? item : x)) : [...list, item]
}

/** Give the listed ids `order` 1..n in list order; ids not listed keep their order after them. */
function reorder<T extends { order: number }>(
  list: readonly T[],
  ids: readonly string[],
  idOf: (x: T) => string,
): T[] {
  const rank = new Map(ids.map((id, i) => [id, i + 1]))
  let next = ids.length
  const rest = [...list]
    .filter((x) => !rank.has(idOf(x)))
    .sort((a, b) => a.order - b.order)
  const tail = new Map(rest.map((x) => [idOf(x), (next += 1)]))
  return list.map((x) => {
    const order = rank.get(idOf(x)) ?? tail.get(idOf(x)) ?? x.order
    return order === x.order ? x : { ...x, order }
  })
}

/**
 * Apply one change to a config and return the new config. Never mutates `config`.
 * `now` stamps `archivedAt` on `employee.archive` (feed time; the reducer passes `event.at`).
 * The result is NOT validated here: callers run `validateConfig` on it (R10).
 */
export function applyConfigChange(config: OrgConfig, change: ConfigChange, now?: Iso): OrgConfig {
  switch (change.kind) {
    case 'department.upsert':
      return {
        ...config,
        departments: upsertBy(config.departments, change.department, (d) => d.id === change.department.id),
      }
    case 'department.reorder':
      return { ...config, departments: reorder(config.departments, change.ids, (d) => d.id) }
    case 'role.upsert':
      return { ...config, roles: upsertBy(config.roles, change.role, (r) => r.key === change.role.key) }
    case 'role.delete':
      return { ...config, roles: config.roles.filter((r) => r.key !== change.key) }
    case 'specialty.upsert':
      return {
        ...config,
        specialties: upsertBy(config.specialties, change.specialty, (s) => s.key === change.specialty.key),
      }
    case 'specialty.delete':
      return { ...config, specialties: config.specialties.filter((s) => s.key !== change.key) }
    case 'employee.upsert':
      return {
        ...config,
        employees: upsertBy(config.employees, change.employee, (e) => e.id === change.employee.id),
      }
    case 'employee.archive':
      return {
        ...config,
        employees: config.employees.map((e) =>
          e.id === change.id && e.state !== 'archived'
            ? { ...e, state: 'archived' as const, archivedAt: now ?? e.archivedAt }
            : e,
        ),
      }
    case 'employee.restore':
      return {
        ...config,
        employees: config.employees.map((e) =>
          e.id === change.id ? { ...e, state: 'active' as const, archivedAt: null } : e,
        ),
      }
    case 'policy.set':
      return { ...config, policy: change.policy }
    case 'rule.upsert':
      return {
        ...config,
        approvalRules: upsertBy(config.approvalRules, change.rule, (r) => r.id === change.rule.id),
      }
    case 'rule.delete':
      return { ...config, approvalRules: config.approvalRules.filter((r) => r.id !== change.id) }
    case 'rule.reorder':
      return { ...config, approvalRules: reorder(config.approvalRules, change.ids, (r) => r.id) }
    case 'platform.upsert':
      return {
        ...config,
        platforms: upsertBy(config.platforms, change.platform, (p) => p.key === change.platform.key),
      }
    case 'shop.upsert':
      return { ...config, shops: upsertBy(config.shops, change.shop, (s) => s.id === change.shop.id) }
    case 'taskType.upsert':
      return {
        ...config,
        taskTypes: upsertBy(config.taskTypes, change.taskType, (t) => t.key === change.taskType.key),
      }
    case 'config.replace':
      return replaceEditable(config, change.config, now)
  }
}

/**
 * Import / reset (D5): the editable parts come from `incoming`, but nothing history or looks
 * refer to disappears. People missing from it are archived; departments and platforms missing
 * from it are switched off. Roles, specialties, rules, shops and task types are replaced as is
 * (`validateConfig` refuses a result that drops a role or specialty still in use).
 */
function replaceEditable(current: OrgConfig, incoming: OrgConfig, now: Iso | undefined): OrgConfig {
  const next = { ...current, ...pickEditable(incoming) }
  const empIds = new Set(next.employees.map((e) => e.id as string))
  const deptIds = new Set(next.departments.map((d) => d.id as string))
  const platformKeys = new Set(next.platforms.map((p) => p.key as string))
  const keptEmployees = current.employees
    .filter((e) => !empIds.has(e.id))
    .map((e) =>
      e.state === 'archived' ? e : { ...e, state: 'archived' as const, archivedAt: now ?? e.archivedAt },
    )
  const keptDepartments = current.departments
    .filter((d) => !deptIds.has(d.id))
    .map((d) => (d.active ? { ...d, active: false } : d))
  const keptPlatforms = current.platforms
    .filter((p) => !platformKeys.has(p.key))
    .map((p) => (p.active ? { ...p, active: false } : p))
  return {
    ...next,
    employees: [...next.employees, ...keptEmployees],
    departments: [...next.departments, ...keptDepartments],
    platforms: [...next.platforms, ...keptPlatforms],
  }
}

/** What a change touches, for history rows and audit (`entity` matches the Supabase table name). */
export function describeChange(change: ConfigChange): {
  entity: string
  entityId: string
  action: string
} {
  switch (change.kind) {
    case 'department.upsert':
      return { entity: 'departments', entityId: change.department.id, action: 'upsert' }
    case 'department.reorder':
      return { entity: 'departments', entityId: '*', action: 'reorder' }
    case 'role.upsert':
      return { entity: 'roles', entityId: change.role.key, action: 'upsert' }
    case 'role.delete':
      return { entity: 'roles', entityId: change.key, action: 'delete' }
    case 'specialty.upsert':
      return { entity: 'specialties', entityId: change.specialty.key, action: 'upsert' }
    case 'specialty.delete':
      return { entity: 'specialties', entityId: change.key, action: 'delete' }
    case 'employee.upsert':
      return { entity: 'employees', entityId: change.employee.id, action: 'upsert' }
    case 'employee.archive':
      return { entity: 'employees', entityId: change.id, action: 'archive' }
    case 'employee.restore':
      return { entity: 'employees', entityId: change.id, action: 'restore' }
    case 'policy.set':
      return { entity: 'policy', entityId: '1', action: 'upsert' }
    case 'rule.upsert':
      return { entity: 'approval_rules', entityId: change.rule.id, action: 'upsert' }
    case 'rule.delete':
      return { entity: 'approval_rules', entityId: change.id, action: 'delete' }
    case 'rule.reorder':
      return { entity: 'approval_rules', entityId: '*', action: 'reorder' }
    case 'platform.upsert':
      return { entity: 'platforms', entityId: change.platform.key, action: 'upsert' }
    case 'shop.upsert':
      return { entity: 'shops', entityId: change.shop.id, action: 'upsert' }
    case 'taskType.upsert':
      return { entity: 'task_types', entityId: change.taskType.key, action: 'upsert' }
    case 'config.replace':
      return { entity: 'config', entityId: '*', action: 'replace' }
  }
}

/** One row of "Nhật ký thay đổi" (R13): Local ring buffer or Supabase `config_audit`. */
export interface ConfigAuditEntry {
  id: string
  at: Iso
  /** Who made it; null when unknown (e.g. a SQL-editor edit). */
  actor: { id: string; name: string } | null
  entity: string
  entityId: string
  action: string
  before: unknown
  after: unknown
}

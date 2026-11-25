// Pure mapping between the config tables (snake_case rows) and the raw OrgConfig input
// (camelCase). No supabase-js import: this stays unit-testable and tree-shakeable.
// Building, floor templates and palette are not in the DB; the caller takes them from the bundle.
import type { Database } from './database.types'

type Tables = Database['public']['Tables']
type Row<T extends keyof Tables> = Tables[T]['Row']

export interface ConfigRows {
  departments: Row<'departments'>[]
  roles: Row<'roles'>[]
  specialties: Row<'specialties'>[]
  platforms: Row<'platforms'>[]
  shops: Row<'shops'>[]
  task_types: Row<'task_types'>[]
  employees: Row<'employees'>[]
  approval_rules: Row<'approval_rules'>[]
  policy: Row<'policy'>[]
}

export const CONFIG_TABLES = [
  'departments',
  'roles',
  'specialties',
  'platforms',
  'shops',
  'task_types',
  'employees',
  'approval_rules',
  'policy',
] as const satisfies readonly (keyof ConfigRows)[]

/** What `mapRows` produces: the entity lists the DB owns (policy absent when there is no row). */
export interface MappedConfig {
  departments: unknown[]
  roles: unknown[]
  specialties: unknown[]
  platforms: unknown[]
  shops: unknown[]
  taskTypes: unknown[]
  employees: unknown[]
  approvalRules: unknown[]
  policy?: unknown
}

type Obj = Record<string, unknown>

function withKey(key: string, def: unknown): Obj {
  return { key, ...(def as Obj) }
}

function withoutKey(item: unknown): { key: string; def: Obj } {
  const { key, ...def } = item as Obj & { key: string }
  return { key, def }
}

export function mapRows(rows: ConfigRows): MappedConfig {
  const out: MappedConfig = {
    departments: [...rows.departments]
      .sort((a, b) => a.order - b.order)
      .map((r) => ({
        id: r.id,
        key: r.key,
        label: r.label,
        order: r.order,
        colorSwatch: r.color_swatch,
        icon: r.icon,
        hours: r.hours,
        floorTemplate: r.floor_template,
        active: r.active,
      })),
    roles: rows.roles.map((r) => withKey(r.key, r.def)),
    specialties: rows.specialties.map((r) => withKey(r.key, r.def)),
    platforms: rows.platforms.map((r) => withKey(r.key, r.def)),
    shops: rows.shops.map((r) => ({
      id: r.id,
      platformKey: r.platform_key,
      name: r.name,
      handle: r.handle,
    })),
    taskTypes: rows.task_types.map((r) => withKey(r.key, r.def)),
    employees: rows.employees.map((r) => ({
      id: r.id,
      name: r.name,
      departmentId: r.department_id,
      roleKey: r.role_key,
      specialties: r.specialties,
      kind: r.kind,
      state: r.state,
      reviewMode: r.review_mode,
      modelTierOverride: r.model_tier_override,
      bio: r.bio,
      createdAt: r.created_at,
      createdBy: r.created_by,
      archivedAt: r.archived_at,
    })),
    approvalRules: [...rows.approval_rules]
      .sort((a, b) => a.order - b.order)
      .map((r) => ({
        id: r.id,
        order: r.order,
        enabled: r.enabled,
        label: r.label,
        when: r.when,
        level: r.level,
      })),
  }
  const policy = rows.policy.find((r) => r.id === 1)
  if (policy) out.policy = policy.doc
  return out
}

/** Inverse of `mapRows`, used by tests (and later by the seed tooling). */
export function toRows(config: Record<string, unknown>): ConfigRows {
  const list = (k: string): Obj[] => (config[k] as Obj[] | undefined) ?? []
  const keyed = (k: string) =>
    list(k).map((item) => {
      const { key, def } = withoutKey(item)
      return { key, def: def as never }
    })
  return {
    departments: list('departments').map((d) => ({
      id: d.id as string,
      key: d.key as string,
      label: d.label as never,
      order: d.order as number,
      color_swatch: d.colorSwatch as string,
      icon: d.icon as string,
      hours: d.hours as string,
      floor_template: d.floorTemplate as string,
      active: d.active as boolean,
    })),
    roles: keyed('roles'),
    specialties: keyed('specialties'),
    platforms: keyed('platforms'),
    shops: list('shops').map((s) => ({
      id: s.id as string,
      platform_key: s.platformKey as string,
      name: s.name as string,
      handle: s.handle as string | null,
    })),
    task_types: keyed('taskTypes'),
    employees: list('employees').map((e) => ({
      id: e.id as string,
      name: e.name as string,
      department_id: e.departmentId as string | null,
      role_key: e.roleKey as string,
      specialties: e.specialties as string[],
      kind: e.kind as string,
      state: e.state as string,
      review_mode: e.reviewMode as string,
      model_tier_override: e.modelTierOverride as string | null,
      bio: (e.bio ?? null) as never,
      created_at: e.createdAt as string,
      created_by: e.createdBy as string,
      archived_at: e.archivedAt as string | null,
    })),
    approval_rules: list('approvalRules').map((r) => ({
      id: r.id as string,
      order: r.order as number,
      enabled: r.enabled as boolean,
      label: r.label as never,
      when: r.when as never,
      level: r.level as never,
    })),
    policy: config.policy ? [{ id: 1, doc: config.policy as never }] : [],
  }
}

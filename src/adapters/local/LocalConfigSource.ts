import { z } from 'zod'
import approvalRules from '@/content/approval-rules.json'
import building from '@/content/building.json'
import bossTemplate from '@/content/floor-templates/boss.json'
import departmentTemplate from '@/content/floor-templates/department.json'
import gamesRestTemplate from '@/content/floor-templates/games_rest.json'
import lobbyCafeTemplate from '@/content/floor-templates/lobby_cafe.json'
import managementTemplate from '@/content/floor-templates/management.json'
import orgSeed from '@/content/org.seed.json'
import palette from '@/content/palette.json'
import platforms from '@/content/platforms.json'
import policy from '@/content/policy.json'
import roles from '@/content/roles.json'
import specialties from '@/content/specialties.json'
import taskTypes from '@/content/task-types.json'
import { parseOrgConfig, type ConfigChange, type OrgConfig } from '@/domain/config'
import {
  applyConfigChange,
  describeChange,
  EDITABLE_CONFIG_KEYS,
  pickEditable,
  type ConfigAuditEntry,
} from '@/domain/configChange'
import { hasErrors, validateConfig } from '@/domain/validateConfig'
import { wallUlid } from '@/lib/ulid'
import { ConfigError, type ConfigActor, type ConfigSource } from '@/ports/ConfigSource'

export { ConfigError }

export const CONFIG_OVERRIDES_KEY = 'office.config.overrides'
/** Ring buffer of the last {@link CONFIG_AUDIT_LIMIT} config changes, newest first (P10 D7). */
export const CONFIG_AUDIT_KEY = 'office.config.audit'
export const CONFIG_AUDIT_LIMIT = 200

const OverrideEnvelopeSchema = z.object({
  v: z.literal(1),
  patch: z.record(z.string(), z.unknown()),
})

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [key, patchVal] of Object.entries(patch)) {
    const baseVal = out[key]
    if (isPlainObject(baseVal) && isPlainObject(patchVal)) {
      out[key] = deepMerge(baseVal, patchVal)
    } else {
      out[key] = patchVal
    }
  }
  return out
}

export function getBundledRawConfig(): Record<string, unknown> {
  return {
    departments: orgSeed.departments,
    employees: orgSeed.employees,
    shops: orgSeed.shops,
    roles,
    specialties,
    platforms,
    approvalRules,
    policy,
    taskTypes,
    building,
    floorTemplates: [
      bossTemplate,
      departmentTemplate,
      gamesRestTemplate,
      lobbyCafeTemplate,
      managementTemplate,
    ],
    palette,
  }
}

export interface LocalConfigSourceOptions {
  /** The signed-in user, for the role check (R15) and history rows. */
  getActor?: () => ConfigActor | null
  /** Wall clock for history rows and `archivedAt`; tests inject a fixed one. */
  now?: () => Date
}

/** Structural equality; a key whose value is `undefined` counts as absent (JSON drops it). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => deepEqual(x, b[i]))
    )
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      if (!deepEqual(a[k], b[k])) return false
    }
    return true
  }
  return false
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

/** The part of the config a change is about, for the before/after columns of a history row. */
function slice(cfg: OrgConfig, change: ConfigChange): unknown {
  const byOrder = <T extends { order: number }>(list: readonly T[]) =>
    [...list].sort((a, b) => a.order - b.order)
  switch (change.kind) {
    case 'department.upsert':
      return cfg.departments.find((d) => d.id === change.department.id) ?? null
    case 'department.reorder':
      return byOrder(cfg.departments).map((d) => d.id)
    case 'role.upsert':
      return cfg.roles.find((r) => r.key === change.role.key) ?? null
    case 'role.delete':
      return cfg.roles.find((r) => r.key === change.key) ?? null
    case 'specialty.upsert':
      return cfg.specialties.find((s) => s.key === change.specialty.key) ?? null
    case 'specialty.delete':
      return cfg.specialties.find((s) => s.key === change.key) ?? null
    case 'employee.upsert':
      return cfg.employees.find((e) => e.id === change.employee.id) ?? null
    case 'employee.archive':
    case 'employee.restore':
      return cfg.employees.find((e) => e.id === change.id) ?? null
    case 'policy.set':
      return cfg.policy
    case 'rule.upsert':
      return cfg.approvalRules.find((r) => r.id === change.rule.id) ?? null
    case 'rule.delete':
      return cfg.approvalRules.find((r) => r.id === change.id) ?? null
    case 'rule.reorder':
      return byOrder(cfg.approvalRules).map((r) => r.id)
    case 'platform.upsert':
      return cfg.platforms.find((p) => p.key === change.platform.key) ?? null
    case 'shop.upsert':
      return cfg.shops.find((s) => s.id === change.shop.id) ?? null
    case 'taskType.upsert':
      return cfg.taskTypes.find((t) => t.key === change.taskType.key) ?? null
    case 'config.replace':
      return {
        departments: cfg.departments.length,
        roles: cfg.roles.length,
        specialties: cfg.specialties.length,
        employees: cfg.employees.length,
        shops: cfg.shops.length,
        platforms: cfg.platforms.length,
        approvalRules: cfg.approvalRules.length,
        taskTypes: cfg.taskTypes.length,
      }
  }
}

/** Archive / restore / delete of something that does not exist is an error, not a silent no-op. */
function missingTarget(cfg: OrgConfig, change: ConfigChange): boolean {
  switch (change.kind) {
    case 'role.delete':
      return !cfg.roles.some((r) => r.key === change.key)
    case 'specialty.delete':
      return !cfg.specialties.some((s) => s.key === change.key)
    case 'employee.archive':
    case 'employee.restore':
      return !cfg.employees.some((e) => e.id === change.id)
    case 'rule.delete':
      return !cfg.approvalRules.some((r) => r.id === change.id)
    default:
      return false
  }
}

export class LocalConfigSource implements ConfigSource {
  private readonly listeners = new Set<(cfg: OrgConfig) => void>()
  private readonly getActor: () => ConfigActor | null
  private readonly now: () => Date

  constructor(options: LocalConfigSourceOptions = {}) {
    this.getActor = options.getActor ?? (() => null)
    this.now = options.now ?? (() => new Date())
  }

  async load(): Promise<OrgConfig> {
    return this.loadSync()
  }

  subscribe(cb: (cfg: OrgConfig) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /**
   * Boss only; validates the whole resulting config; stores only what differs from the bundled
   * seed (so a reset clears the overrides key); notifies subscribers; appends a history row.
   * Synchronous inside, so two applies never interleave a read-modify-write.
   */
  async apply(change: ConfigChange): Promise<void> {
    const actor = this.getActor()
    if (!actor || actor.role !== 'boss') throw new ConfigError('forbidden')

    const current = this.loadSync()
    if (missingTarget(current, change)) throw new ConfigError('not_found')

    const at = this.now().toISOString()
    const next = applyConfigChange(current, change, at)
    const issues = validateConfig(next)
    if (hasErrors(issues)) throw new ConfigError('invalid', undefined, issues)

    this.saveOverrides(next)
    const stored = this.loadSync()

    const { entity, entityId, action } = describeChange(change)
    this.appendAudit({
      id: wallUlid(this.now().getTime()),
      at,
      actor: { id: actor.userId, name: actor.displayName },
      entity,
      entityId,
      action,
      before: slice(current, change),
      after: slice(stored, change),
    })

    for (const cb of [...this.listeners]) cb(stored)
  }

  /** Newest first, at most `limit` rows. */
  async history(limit = CONFIG_AUDIT_LIMIT): Promise<ConfigAuditEntry[]> {
    return this.readAudit().slice(0, Math.max(0, limit))
  }

  private loadSync(): OrgConfig {
    const bundledRaw = getBundledRawConfig()
    const baseConfig = parseOrgConfig(bundledRaw)

    const rawOverride = readStorage(CONFIG_OVERRIDES_KEY)
    if (!rawOverride) {
      return baseConfig
    }

    try {
      const parsedJson: unknown = JSON.parse(rawOverride)
      const env = OverrideEnvelopeSchema.parse(parsedJson)
      const merged = deepMerge(bundledRaw, env.patch)
      return parseOrgConfig(merged)
    } catch (err) {
      console.warn('Ignoring invalid office.config.overrides in localStorage:', err)
      return baseConfig
    }
  }

  /** Keep hand-written overrides of non-editable parts; store editable parts that differ from the seed. */
  private saveOverrides(next: OrgConfig): void {
    const seed = pickEditable(parseOrgConfig(getBundledRawConfig()))
    const edited = pickEditable(next)

    let patch: Record<string, unknown> = {}
    try {
      const raw = readStorage(CONFIG_OVERRIDES_KEY)
      if (raw) {
        const env = OverrideEnvelopeSchema.parse(JSON.parse(raw))
        patch = Object.fromEntries(
          Object.entries(env.patch).filter(
            ([k]) => !(EDITABLE_CONFIG_KEYS as readonly string[]).includes(k),
          ),
        )
      }
    } catch {
      patch = {}
    }
    for (const k of EDITABLE_CONFIG_KEYS) {
      if (!deepEqual(edited[k], seed[k])) patch[k] = edited[k]
    }

    try {
      if (Object.keys(patch).length === 0) {
        localStorage.removeItem(CONFIG_OVERRIDES_KEY)
      } else {
        localStorage.setItem(CONFIG_OVERRIDES_KEY, JSON.stringify({ v: 1, patch }))
      }
    } catch (err) {
      throw new ConfigError('unknown', err instanceof Error ? err.message : 'storage unavailable')
    }
  }

  private readAudit(): ConfigAuditEntry[] {
    const raw = readStorage(CONFIG_AUDIT_KEY)
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(
        (e): e is ConfigAuditEntry => isPlainObject(e) && typeof e.id === 'string' && typeof e.at === 'string',
      )
    } catch {
      return []
    }
  }

  /** Best effort: the change is already stored, so a full or blocked storage must not fail it. */
  private appendAudit(entry: ConfigAuditEntry): void {
    try {
      const next = [entry, ...this.readAudit()].slice(0, CONFIG_AUDIT_LIMIT)
      localStorage.setItem(CONFIG_AUDIT_KEY, JSON.stringify(next))
    } catch (err) {
      console.warn('Could not write the local config history:', err)
    }
  }
}

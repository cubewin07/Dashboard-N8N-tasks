// ConfigSource over the config tables (P09-T10) and the boss write RPCs (P10-T04, D4).
import { getBundledRawConfig } from '@/adapters/local/LocalConfigSource'
import { parseOrgConfig, type ConfigChange, type OrgConfig } from '@/domain/config'
import { pickEditable, type ConfigAuditEntry } from '@/domain/configChange'
import { ConfigError, type ConfigSource } from '@/ports/ConfigSource'
import type { Db } from './client'
import { CONFIG_TABLES, mapRows, type ConfigRows, type MappedConfig } from './configRows'
import type { Json } from './database.types'
import type { RealtimeHub } from './realtime'

export const CONFIG_DEBOUNCE_MS = 150

const LIST_KEYS = [
  'departments',
  'roles',
  'specialties',
  'platforms',
  'shops',
  'taskTypes',
  'employees',
  'approvalRules',
] as const

/**
 * A stylist's RLS view returns 0 rows for boss-only tables (spec §3.2). Fill every empty list
 * (and a missing policy) from the bundled defaults so the config still validates.
 */
function fillFromBundle(mapped: MappedConfig): Record<string, unknown> {
  const bundle = getBundledRawConfig()
  const out: Record<string, unknown> = { ...bundle }
  for (const k of LIST_KEYS) {
    if (mapped[k].length > 0) out[k] = mapped[k]
  }
  if (mapped.policy !== undefined) out.policy = mapped.policy
  return out
}

const json = (v: unknown): Json => v as Json

interface RpcError {
  code?: string
  message?: string
}

/**
 * Postgres errcodes (contracts.md §5.1 + migration 0006) to `ConfigError`.
 *   42501 insufficient_privilege            -> forbidden
 *   P0002 / unknown_*                       -> not_found
 *   22023, 23xxx (fk, unique, check, not null), 22P02 -> invalid (the SQL message is kept)
 *   no code + a fetch failure message       -> network
 */
export function toConfigError(error: RpcError): ConfigError {
  const code = error.code ?? ''
  const message = error.message ?? 'unknown'
  if (code === '42501' || /insufficient_privilege/.test(message)) return new ConfigError('forbidden', message)
  if (code === 'P0002' || /^unknown_/.test(message)) return new ConfigError('not_found', message)
  if (code === '22023' || code === '22P02' || code.startsWith('23')) return new ConfigError('invalid', message)
  if (!code && /fetch|network|load failed|timed? ?out/i.test(message)) return new ConfigError('network', message)
  return new ConfigError('unknown', message)
}

interface AuditRow {
  id: number
  at: string
  actor: string
  entity: string
  entity_id: string
  action: string
  before: unknown
  after: unknown
}

export class SupabaseConfigSource implements ConfigSource {
  private readonly listeners = new Set<(cfg: OrgConfig) => void>()
  private closeChannel: (() => void) | null = null
  private unregisterReload: (() => void) | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly db: Db,
    private readonly hub: RealtimeHub,
  ) {}

  async load(): Promise<OrgConfig> {
    const results = await Promise.all(
      CONFIG_TABLES.map(async (t) => ({ t, res: await this.db.from(t).select('*') })),
    )
    const rows: Record<string, unknown[]> = {}
    for (const { t, res } of results) {
      if (res.error) throw new Error(`Config load failed (${t}): ${res.error.message}`)
      rows[t] = res.data ?? []
    }
    return parseOrgConfig(fillFromBundle(mapRows(rows as unknown as ConfigRows)))
  }

  subscribe(cb: (cfg: OrgConfig) => void): () => void {
    this.listeners.add(cb)
    if (!this.closeChannel) this.open()
    return () => {
      this.listeners.delete(cb)
      if (this.listeners.size === 0) this.close()
    }
  }

  /**
   * One RPC per change kind (phase-09 §3.3 / 0005 + 0006). The server does the role check and writes
   * the audit row. Afterwards a debounced reload makes subscribers see the stored config even when
   * the realtime channel is down (it shares the realtime debounce timer, so it is one reload).
   */
  async apply(change: ConfigChange): Promise<void> {
    let error: RpcError | null
    try {
      ;({ error } = await this.call(change))
    } catch (err) {
      throw new ConfigError('network', err instanceof Error ? err.message : String(err))
    }
    if (error) throw toConfigError(error)
    if (this.listeners.size > 0) this.schedule()
  }

  private call(change: ConfigChange): PromiseLike<{ error: RpcError | null }> {
    const db = this.db
    switch (change.kind) {
      case 'department.upsert':
        return db.rpc('upsert_department', { p: json(change.department) })
      case 'department.reorder':
        return db.rpc('reorder_departments', { p_ids: change.ids })
      case 'role.upsert':
        return db.rpc('upsert_role', { p: json(change.role) })
      case 'role.delete':
        return db.rpc('delete_role', { p_key: change.key })
      case 'specialty.upsert':
        return db.rpc('upsert_specialty', { p: json(change.specialty) })
      case 'specialty.delete':
        return db.rpc('delete_specialty', { p_key: change.key })
      case 'employee.upsert':
        return db.rpc('upsert_employee', { p: json(change.employee) })
      case 'employee.archive':
        return db.rpc('archive_employee', { p_id: change.id, p_reason: change.reason })
      case 'employee.restore':
        return db.rpc('restore_employee', { p_id: change.id })
      case 'policy.set':
        return db.rpc('set_policy', { p: json(change.policy) })
      case 'rule.upsert':
        return db.rpc('upsert_approval_rule', { p: json(change.rule) })
      case 'rule.delete':
        return db.rpc('delete_approval_rule', { p_id: change.id })
      case 'rule.reorder':
        return db.rpc('reorder_approval_rules', { p_ids: change.ids })
      case 'platform.upsert':
        return db.rpc('upsert_platform', { p: json(change.platform) })
      case 'shop.upsert':
        return db.rpc('upsert_shop', { p: json(change.shop) })
      case 'taskType.upsert':
        return db.rpc('upsert_task_type', { p: json(change.taskType) })
      case 'config.replace':
        return db.rpc('replace_config', { p: json(pickEditable(change.config)) })
    }
  }

  /** Newest first. `before` / `after` are the stored rows (snake_case) as `config_audit` keeps them. */
  async history(limit = 200): Promise<ConfigAuditEntry[]> {
    let rows: AuditRow[]
    let names: Map<string, string>
    try {
      const res = await this.db
        .from('config_audit')
        .select('*')
        .order('at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (res.error) throw toConfigError(res.error)
      rows = (res.data ?? []) as AuditRow[]
      const actorIds = [...new Set(rows.map((r) => r.actor))]
      names = new Map()
      if (actorIds.length > 0) {
        const users = await this.db
          .from('app_users')
          .select('user_id, display_name')
          .in('user_id', actorIds)
        if (users.error) throw toConfigError(users.error)
        for (const u of users.data ?? []) names.set(u.user_id, u.display_name)
      }
    } catch (err) {
      if (err instanceof ConfigError) throw err
      throw new ConfigError('network', err instanceof Error ? err.message : String(err))
    }
    return rows.map((r) => ({
      id: String(r.id),
      at: r.at,
      actor: { id: r.actor, name: names.get(r.actor) ?? r.actor.slice(0, 8) },
      entity: r.entity,
      entityId: r.entity_id,
      action: r.action,
      before: r.before,
      after: r.after,
    }))
  }

  private open(): void {
    this.closeChannel = this.hub.openChannel(this.db, 'config', (ch) => {
      let c = ch
      for (const table of CONFIG_TABLES) {
        c = c.on('postgres_changes', { event: '*', schema: 'public', table }, () =>
          this.schedule(),
        )
      }
      return c
    })
    this.unregisterReload = this.hub.registerReload(() => void this.reloadAndEmit())
  }

  private close(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.closeChannel?.()
    this.unregisterReload?.()
    this.closeChannel = null
    this.unregisterReload = null
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.reloadAndEmit()
    }, CONFIG_DEBOUNCE_MS)
  }

  private async reloadAndEmit(): Promise<void> {
    try {
      const cfg = await this.load()
      for (const cb of [...this.listeners]) cb(cfg)
    } catch (err) {
      console.warn('Config reload failed:', err)
    }
  }
}

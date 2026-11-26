// ConfigSource over the config tables (P09-T10). Read-only here; writes arrive in P10 (D4).
import { getBundledRawConfig } from '@/adapters/local/LocalConfigSource'
import { parseOrgConfig, type ConfigChange, type OrgConfig } from '@/domain/config'
import type { ConfigAuditEntry } from '@/domain/configChange'
import { ConfigError, type ConfigSource } from '@/ports/ConfigSource'
import type { Db } from './client'
import { CONFIG_TABLES, mapRows, type ConfigRows, type MappedConfig } from './configRows'
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

  async apply(_change: ConfigChange): Promise<void> {
    void _change
    throw new ConfigError('unknown', 'TODO(P10-T04)')
  }

  async history(_limit = 200): Promise<ConfigAuditEntry[]> {
    void _limit
    return [] // TODO(P10-T04): config_audit
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

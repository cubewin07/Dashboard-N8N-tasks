// STUB (P09-T10 replaces it): ConfigSource over the config tables.
import type { ConfigChange, OrgConfig } from '@/domain/config'
import type { ConfigSource } from '@/ports/ConfigSource'
import type { Db } from './client'
import type { RealtimeHub } from './realtime'

export class SupabaseConfigSource implements ConfigSource {
  constructor(
    private readonly db: Db,
    private readonly hub: RealtimeHub,
  ) {}
  async load(): Promise<OrgConfig> {
    void this.db
    void this.hub
    throw new Error('not implemented')
  }
  subscribe(_cb: (cfg: OrgConfig) => void): () => void {
    void _cb
    return () => {}
  }
  async apply(_change: ConfigChange): Promise<void> {
    void _change
    throw new Error('not implemented')
  }
}

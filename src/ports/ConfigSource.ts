import type { ConfigChange, OrgConfig } from '@/domain/config'

export interface ConfigSource {
  load(): Promise<OrgConfig>
  subscribe(cb: (cfg: OrgConfig) => void): () => void
  apply(change: ConfigChange): Promise<void>
}

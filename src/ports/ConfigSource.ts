import type { ConfigChange, OrgConfig } from '@/domain/config'
import type { ConfigAuditEntry } from '@/domain/configChange'
import type { ConfigIssue } from '@/domain/validateConfig'

export interface ConfigSource {
  load(): Promise<OrgConfig>
  subscribe(cb: (cfg: OrgConfig) => void): () => void
  /**
   * Role-checked (boss only) and validated with `validateConfig` on the whole resulting config
   * (R10). Throws `ConfigError`. Resolves once the change is stored.
   */
  apply(change: ConfigChange): Promise<void>
  /** v1.3: newest first, at most `limit` (default 200) rows of "Nhật ký thay đổi" (R13). */
  history(limit?: number): Promise<ConfigAuditEntry[]>
}

export type ConfigErrorCode =
  /** Not a boss session (R15). */
  | 'forbidden'
  /** `validateConfig` found errors; see `issues`. Nothing was saved. */
  | 'invalid'
  /** The entity to archive / restore / delete does not exist. */
  | 'not_found'
  /** Network or backend unavailable. */
  | 'network'
  | 'unknown'

export class ConfigError extends Error {
  readonly code: ConfigErrorCode | (string & {})
  readonly issues: ConfigIssue[]
  constructor(code: ConfigErrorCode | (string & {}), message?: string, issues: ConfigIssue[] = []) {
    super(message ?? code)
    this.name = 'ConfigError'
    this.code = code
    this.issues = issues
  }
}

/** Who is writing: adapters check `role` (R15) and stamp history rows with `name`. */
export interface ConfigActor {
  userId: string
  role: 'boss' | 'stylist'
  displayName: string
}

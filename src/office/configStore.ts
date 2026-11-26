import { create } from 'zustand'
import { getBundledRawConfig, LocalConfigSource } from '@/adapters/local/LocalConfigSource'
import { parseOrgConfig, type ConfigChange, type OrgConfig } from '@/domain/config'
import { applyConfigChange, type ConfigAuditEntry } from '@/domain/configChange'
import type { Iso } from '@/domain/primitives'
import { hasErrors, validateConfig } from '@/domain/validateConfig'
import { ConfigError, type ConfigActor, type ConfigSource } from '@/ports/ConfigSource'

export type ConfigStatus = 'loading' | 'ready' | 'error'

/**
 * Where the current `config` came from:
 * - `load`: the first load; `remote`: the source pushed it (realtime, another browser, an echo);
 * - `ui`: an optimistic boss edit (`lastChange` set); `feed`: a hire/leave the feed made, persisted;
 * - `rollback`: a failed write was undone.
 * The office store forwards everything except `feed` to the feed (P10 §3.2: no double arrival).
 */
export type ConfigOrigin = 'load' | 'remote' | 'ui' | 'feed' | 'rollback'

export interface ConfigStoreState {
  config: OrgConfig | null
  status: ConfigStatus
  error: string | null
  lastChange: ConfigChange | null
  origin: ConfigOrigin
}

let actorGetter: () => ConfigActor | null = () => null
let clock: () => Iso = () => new Date().toISOString()

let activeSource: ConfigSource = new LocalConfigSource({ getActor: () => actorGetter() })
let unsubscribeSource: (() => void) | null = null

export const useConfigStore = create<ConfigStoreState>(() => ({
  config: null,
  status: 'loading',
  error: null,
  lastChange: null,
  origin: 'load',
}))

/** Set by src/app: who is signed in (role check R15, history rows). */
export function setConfigActorGetter(getter: () => ConfigActor | null): void {
  actorGetter = getter
}

/** Set by the office store: feed time stamps `archivedAt` like the reducer does. */
export function setConfigClock(now: () => Iso): void {
  clock = now
}

export function setConfigSource(source: ConfigSource): void {
  if (unsubscribeSource) {
    unsubscribeSource()
    unsubscribeSource = null
  }
  activeSource = source
}

export async function loadConfig(): Promise<OrgConfig> {
  useConfigStore.setState({ status: 'loading', error: null })
  try {
    const config = await activeSource.load()
    useConfigStore.setState({
      config,
      status: 'ready',
      error: null,
      lastChange: null,
      origin: 'load',
    })
    if (unsubscribeSource) {
      unsubscribeSource()
    }
    unsubscribeSource = activeSource.subscribe((nextConfig) => {
      useConfigStore.setState({
        config: nextConfig,
        status: 'ready',
        error: null,
        lastChange: null,
        origin: 'remote',
      })
    })
    return config
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load config'
    useConfigStore.setState({ config: null, status: 'error', error: message })
    throw err
  }
}

function toConfigError(err: unknown): ConfigError {
  if (err instanceof ConfigError) return err
  return new ConfigError('unknown', err instanceof Error ? err.message : String(err))
}

/**
 * The one write path for config (R10, R11, D4). Boss only; the whole resulting config is
 * validated first (errors → `ConfigError('invalid', issues)`, nothing applied). Then the change
 * shows at once (optimistic) and is stored through the ConfigSource; if that fails the change is
 * rolled back and the error rethrown for the caller's toast.
 */
export async function applyConfigEdit(
  change: ConfigChange,
  options: { origin?: 'ui' | 'feed' } = {},
): Promise<void> {
  const origin = options.origin ?? 'ui'
  const actor = actorGetter()
  if (!actor || actor.role !== 'boss') throw new ConfigError('forbidden')
  const prev = useConfigStore.getState().config
  if (!prev) throw new ConfigError('unknown', 'Config is not loaded')

  const next = applyConfigChange(prev, change, clock())
  const issues = validateConfig(next)
  if (hasErrors(issues)) throw new ConfigError('invalid', undefined, issues)

  useConfigStore.setState({ config: next, lastChange: change, origin })
  try {
    await activeSource.apply(change)
  } catch (err) {
    if (useConfigStore.getState().config === next) {
      useConfigStore.setState({ config: prev, lastChange: null, origin: 'rollback' })
    } else {
      // Something else landed on top of the optimistic config: ask the source for the truth.
      void activeSource
        .load()
        .then((cfg) =>
          useConfigStore.setState({ config: cfg, lastChange: null, origin: 'rollback' }),
        )
        .catch((reloadErr: unknown) => console.warn('Config reload after rollback failed:', reloadErr))
    }
    throw toConfigError(err)
  }
}

/** "Nhật ký thay đổi" rows, newest first (R13). */
export function loadConfigHistory(limit = 200): Promise<ConfigAuditEntry[]> {
  return activeSource.history(limit)
}

/** The bundled seed config (for "Khôi phục mặc định", R14). */
export function seedConfig(): OrgConfig {
  return parseOrgConfig(getBundledRawConfig())
}

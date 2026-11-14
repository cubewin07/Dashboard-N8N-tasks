import { create } from 'zustand'
import { LocalConfigSource } from '@/adapters/local/LocalConfigSource'
import type { OrgConfig } from '@/domain/config'
import type { ConfigSource } from '@/ports/ConfigSource'

export type ConfigStatus = 'loading' | 'ready' | 'error'

export interface ConfigStoreState {
  config: OrgConfig | null
  status: ConfigStatus
  error: string | null
}

let activeSource: ConfigSource = new LocalConfigSource()
let unsubscribeSource: (() => void) | null = null

export const useConfigStore = create<ConfigStoreState>(() => ({
  config: null,
  status: 'loading',
  error: null,
}))

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
    useConfigStore.setState({ config, status: 'ready', error: null })
    if (unsubscribeSource) {
      unsubscribeSource()
    }
    unsubscribeSource = activeSource.subscribe((nextConfig) => {
      useConfigStore.setState({ config: nextConfig, status: 'ready', error: null })
    })
    return config
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load config'
    useConfigStore.setState({ config: null, status: 'error', error: message })
    throw err
  }
}

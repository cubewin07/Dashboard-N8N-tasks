import { useCallback } from 'react'
import type { Label } from '@/domain/primitives'
import type { OfficeState } from '@/domain/work'
import { useI18n } from '@/i18n'
import { useConfigStore, type ConfigStoreState } from './configStore'
import { startOffice, useOffice, type OfficeCommandState } from './store'

export function useOfficeSelector<T>(selector: (state: OfficeState | null) => T): T {
  return useOffice((s) => selector(s.state))
}

export function useCommandStatus(id: string | null | undefined): {
  status: OfficeCommandState
  reason: string | null
} {
  const record = useOffice((s) => (id ? s.commands[id] : undefined))
  return {
    status: record?.status ?? 'idle',
    reason: record?.reason ?? null,
  }
}

export function useConfig(): Pick<ConfigStoreState, 'config' | 'status' | 'error'> {
  const config = useConfigStore((s) => s.config)
  const status = useConfigStore((s) => s.status)
  const error = useConfigStore((s) => s.error)
  return { config, status, error }
}

export function useLabel(): (label: Label) => string {
  const { lang } = useI18n()
  return useCallback((label: Label) => label[lang] || label.vi, [lang])
}

/**
 * Whether the config or the feed failed to boot, plus a retry that boots again.
 * Screens use it to replace an endless skeleton with an error state.
 */
export function useBootFailure(): { failed: boolean; retry: () => void } {
  const status = useConfigStore((s) => s.status)
  const bootError = useOffice((s) => s.bootError)
  return {
    failed: status === 'error' || bootError !== null,
    retry: startOffice,
  }
}

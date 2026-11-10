import { useCallback } from 'react'
import type { Label } from '@/domain/primitives'
import type { OfficeState } from '@/domain/work'
import { useI18n } from '@/i18n'
import { useConfigStore, type ConfigStoreState } from './configStore'
import { useOffice } from './store'

export function useOfficeSelector<T>(selector: (state: OfficeState | null) => T): T {
  return useOffice((s) => selector(s.state))
}

export function useConfig(): ConfigStoreState {
  const config = useConfigStore((s) => s.config)
  const status = useConfigStore((s) => s.status)
  const error = useConfigStore((s) => s.error)
  return { config, status, error }
}

export function useLabel(): (label: Label) => string {
  const { lang } = useI18n()
  return useCallback((label: Label) => label[lang] || label.vi, [lang])
}

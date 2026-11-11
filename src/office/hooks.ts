import { useCallback } from 'react'
import type { Label } from '@/domain/primitives'
import type { OfficeState } from '@/domain/work'
import { useI18n } from '@/i18n'
import { useConfigStore, type ConfigStoreState } from './configStore'
import { useOffice, type OfficeCommandState } from './store'

const LEGACY_PREFIXES = [
  '/legacy',
  '/inbox',
  '/tasks',
  '/start',
  '/library',
  '/team',
]

export function isLegacyPathname(pathname: string): boolean {
  return LEGACY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function isLegacyHash(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash || ''
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const qIdx = raw.indexOf('?')
  const path = qIdx >= 0 ? raw.slice(0, qIdx) : raw
  return isLegacyPathname(path || '/')
}

export function useIsLegacyRoute(): boolean {
  const legacyActive = useOffice((s) => s.legacyActive)
  return legacyActive || isLegacyHash()
}

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

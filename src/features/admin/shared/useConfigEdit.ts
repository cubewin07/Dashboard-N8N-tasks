import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ConfigChange } from '@/domain/config'
import { applyConfigChange } from '@/domain/configChange'
import { hasErrors, validateConfig, type ConfigIssue } from '@/domain/validateConfig'
import { useI18n } from '@/i18n'
import { applyConfigEdit, useConfigStore } from '@/office/configStore'
import { ConfigError } from '@/ports/ConfigSource'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Save one ConfigChange through the office layer (validate → optimistic → store → rollback).
 * Shows a toast on failure; `issues` holds the validation result when the change was refused.
 */
export function useConfigEdit() {
  const { t } = useI18n()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [issues, setIssues] = useState<ConfigIssue[]>([])
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const save = useCallback(
    async (change: ConfigChange): Promise<boolean> => {
      setStatus('saving')
      setErrorCode(null)
      try {
        await applyConfigEdit(change)
        setIssues([])
        setStatus('saved')
        return true
      } catch (err) {
        const e = err instanceof ConfigError ? err : new ConfigError('unknown', String(err))
        const code = e.code in t.admin.errors ? (e.code as keyof typeof t.admin.errors) : 'unknown'
        setIssues(e.issues)
        setErrorCode(code)
        setStatus('error')
        toast.error(t.admin.errors[code])
        return false
      }
    },
    [t],
  )

  const reset = useCallback(() => {
    setStatus('idle')
    setIssues([])
    setErrorCode(null)
  }, [])

  return { status, issues, errorCode, save, reset }
}

/**
 * Issues the whole config would have after `change` (null → none). Drives inline validation and
 * "Lưu" being disabled before anything is sent (R10).
 */
export function useDraftIssues(change: ConfigChange | null): {
  issues: ConfigIssue[]
  blocking: boolean
} {
  const config = useConfigStore((s) => s.config)
  return useMemo(() => {
    if (!config || !change) return { issues: [], blocking: false }
    const issues = validateConfig(applyConfigChange(config, change))
    return { issues, blocking: hasErrors(issues) }
  }, [config, change])
}

/** Only the issues a draft adds compared to the saved config (old warnings are not the form's fault). */
export function newIssues(issues: readonly ConfigIssue[], baseline: readonly ConfigIssue[]): ConfigIssue[] {
  const seen = new Set(baseline.map((i) => `${i.code}|${i.path.join('.')}`))
  return issues.filter((i) => !seen.has(`${i.code}|${i.path.join('.')}`))
}

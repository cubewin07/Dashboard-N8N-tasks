import { useMemo } from 'react'
import type { ConfigChange } from '@/domain/config'
import { validateConfig, type ConfigIssue } from '@/domain/validateConfig'
import { useConfigStore } from '@/office/configStore'
import { newIssues, useDraftIssues } from '../shared/useConfigEdit'

/**
 * Inline validation for a draft change (R10): errors always show (they block "Lưu"), warnings only
 * when the change itself introduces them, so old warnings do not nag on every form.
 */
export function useChangeIssues(change: ConfigChange | null): {
  issues: ConfigIssue[]
  blocking: boolean
} {
  const config = useConfigStore((s) => s.config)
  const { issues, blocking } = useDraftIssues(change)
  const baseline = useMemo(() => (config ? validateConfig(config) : []), [config])
  const visible = useMemo(() => {
    const fresh = new Set(newIssues(issues, baseline))
    return issues.filter((i) => i.level === 'error' || fresh.has(i))
  }, [issues, baseline])
  return { issues: visible, blocking }
}

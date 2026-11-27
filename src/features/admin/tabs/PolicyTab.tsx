import { EmptyState } from '@/components'
import { useI18n } from '@/i18n'

// Placeholder: replaced by the P10 task that owns the "policy" tab.
export function PolicyTab() {
  const { t } = useI18n()
  return <EmptyState title={t.admin.tabs.policy} description={t.admin.empty} />
}

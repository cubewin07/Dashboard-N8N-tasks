import { EmptyState } from '@/components'
import { useI18n } from '@/i18n'

// Placeholder: replaced by the P10 task that owns the "history" tab.
export function HistoryTab() {
  const { t } = useI18n()
  return <EmptyState title={t.admin.tabs.history} description={t.admin.empty} />
}

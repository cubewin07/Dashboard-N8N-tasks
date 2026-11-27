import { EmptyState } from '@/components'
import { useI18n } from '@/i18n'

// Placeholder: replaced by the P10 task that owns the "rules" tab.
export function RulesTab() {
  const { t } = useI18n()
  return <EmptyState title={t.admin.tabs.rules} description={t.admin.empty} />
}

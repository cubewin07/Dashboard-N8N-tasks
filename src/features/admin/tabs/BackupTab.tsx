import { EmptyState } from '@/components'
import { useI18n } from '@/i18n'

// Placeholder: replaced by the P10 task that owns the "backup" tab.
export function BackupTab() {
  const { t } = useI18n()
  return <EmptyState title={t.admin.tabs.backup} description={t.admin.empty} />
}

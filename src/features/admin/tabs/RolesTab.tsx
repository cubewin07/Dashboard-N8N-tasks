import { EmptyState } from '@/components'
import { useI18n } from '@/i18n'

// Placeholder: replaced by the P10 task that owns the "roles" tab.
export function RolesTab() {
  const { t } = useI18n()
  return <EmptyState title={t.admin.tabs.roles} description={t.admin.empty} />
}

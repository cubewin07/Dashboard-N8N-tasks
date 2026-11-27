import { EmptyState } from '@/components'
import { useI18n } from '@/i18n'

// Placeholder: replaced by the P10 task that owns the "departments" tab.
export function DepartmentsTab() {
  const { t } = useI18n()
  return <EmptyState title={t.admin.tabs.departments} description={t.admin.empty} />
}

import { EmptyState } from '@/components'
import { useI18n } from '@/i18n'

// Placeholder: replaced by the P10 task that owns the "people" tab.
export function PeopleTab() {
  const { t } = useI18n()
  return <EmptyState title={t.admin.tabs.people} description={t.admin.empty} />
}

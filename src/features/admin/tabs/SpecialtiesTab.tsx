import { EmptyState } from '@/components'
import { useI18n } from '@/i18n'

// Placeholder: replaced by the P10 task that owns the "specialties" tab.
export function SpecialtiesTab() {
  const { t } = useI18n()
  return <EmptyState title={t.admin.tabs.specialties} description={t.admin.empty} />
}

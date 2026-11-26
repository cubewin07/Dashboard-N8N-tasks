import { EmptyState } from '@/components'
import { useI18n } from '@/i18n'

// Placeholder: replaced by the P10 task that owns the "platforms" tab.
export function PlatformsTab() {
  const { t } = useI18n()
  return <EmptyState title={t.admin.tabs.platforms} description={t.admin.empty} />
}

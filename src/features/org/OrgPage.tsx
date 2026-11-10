import { PageHeader } from '@/components'
import { useI18n } from '@/i18n'
import { OrgList } from './OrgList'

export function OrgPage() {
  const { t } = useI18n()
  return (
    <div className="space-y-6 pb-12">
      <PageHeader title={t.org.title} description={t.org.description} />
      <OrgList />
    </div>
  )
}

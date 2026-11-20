import { PageHeader } from '@/components'
import { useI18n } from '@/i18n'

/** Tủ đồ: appearance editor (P08b). Placeholder until the editor tasks land. */
export function WardrobePage() {
  const { t } = useI18n()
  return (
    <div className="space-y-6">
      <PageHeader title={t.wardrobe.title} description={t.wardrobe.description} />
      <p className="text-sm text-muted-foreground">{t.wardrobe.deviceOnly}</p>
    </div>
  )
}

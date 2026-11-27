import { WifiOff } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useOffice } from '@/office'

/** A full-width notice while the feed is offline (R13: live state, honest badge). */
export function OfflineBanner() {
  const { t } = useI18n()
  const offline = useOffice((s) => s.connection) === 'offline'
  return (
    <div role="status" aria-live="polite">
      {offline && (
        <p className="flex items-center justify-center gap-2 bg-blocked px-4 py-2 text-center text-sm font-medium text-primary-foreground">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          {t.common.live.offline}
        </p>
      )}
    </div>
  )
}

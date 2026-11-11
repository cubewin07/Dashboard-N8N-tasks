import { PowerOff, WifiOff } from 'lucide-react'
import { useConnection } from '@/app/RealtimeProvider'
import { useTeamOnline } from '@/hooks/queries'
import { useI18n } from '@/i18n'
import { formatTime } from '@/lib/time'
import { fmt } from '@/lib/utils'
import { useIsLegacyRoute, useOffice } from '@/office'

export function OfflineBanner() {
  const { t } = useI18n()
  const isLegacy = useIsLegacyRoute()
  const legacyConn = useConnection()
  const legacyTeam = useTeamOnline()
  const officeConn = useOffice((s) => s.connection)
  const officeHeartbeatAt = useOffice((s) => s.state?.lastHeartbeat?.at ?? null)

  const conn = isLegacy ? legacyConn : officeConn
  const online = isLegacy ? legacyTeam.online : officeConn === 'live'
  const heartbeatAt = isLegacy ? legacyTeam.heartbeatAt : officeHeartbeatAt
  const teamText = heartbeatAt
    ? fmt(t.common.team.offlineSince, { time: formatTime(heartbeatAt) })
    : t.common.team.offline

  return (
    <div role="status" aria-live="polite">
      {conn === 'offline' && (
        <p className="flex items-center justify-center gap-2 bg-blocked px-4 py-2 text-center text-sm font-medium text-primary-foreground">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          {t.common.live.offline}
        </p>
      )}
      {isLegacy && !online && (
        <p className="striped-offline flex items-center justify-center gap-2 border-b border-waiting/30 bg-waiting-soft px-4 py-2 text-center text-sm font-medium text-waiting">
          <PowerOff className="size-4 shrink-0" aria-hidden />
          {teamText}
        </p>
      )}
    </div>
  )
}

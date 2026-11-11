import { useTeamOnline } from '@/hooks/queries'
import { useI18n } from '@/i18n'
import { formatTime } from '@/lib/time'
import { cn, fmt } from '@/lib/utils'
import { useIsLegacyRoute, useOffice } from '@/office'
import { isTeamOnline } from '@/office/liveness'

export function TeamOnlineIndicator({
  compact,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const isLegacy = useIsLegacyRoute()
  const legacyTeam = useTeamOnline()
  const officeConn = useOffice((s) => s.connection)
  const officeHeartbeatAt = useOffice((s) => s.state?.lastHeartbeat?.at ?? null)
  const officeNow = useOffice((s) => s.state?.now ?? null)

  const online = isLegacy
    ? legacyTeam.online
    : isTeamOnline(officeConn, officeHeartbeatAt, officeNow)
  const heartbeatAt = isLegacy ? legacyTeam.heartbeatAt : officeHeartbeatAt

  const label = online
    ? t.common.team.online
    : heartbeatAt
      ? fmt(t.common.team.offlineSince, { time: formatTime(heartbeatAt) })
      : t.common.team.offline

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        online ? 'text-done' : 'text-muted-foreground',
        className,
      )}
      title={compact ? label : undefined}
    >
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full',
          online ? 'bg-done text-done animate-pulse-dot' : 'bg-idle',
        )}
      />
      <span className={cn(compact && 'sr-only')}>{label}</span>
    </span>
  )
}

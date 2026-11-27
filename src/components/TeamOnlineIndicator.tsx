import { useI18n } from '@/i18n'
import { formatTime } from '@/lib/time'
import { cn, fmt } from '@/lib/utils'
import { useOffice } from '@/office'
import { isTeamOnline } from '@/office/liveness'

/** Whether the team (the feed's worker) is on duty, from the feed's heartbeat. */
export function TeamOnlineIndicator({
  compact,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const connection = useOffice((s) => s.connection)
  const heartbeatAt = useOffice((s) => s.state?.lastHeartbeat?.at ?? null)
  const feedNow = useOffice((s) => s.state?.now ?? null)
  const online = isTeamOnline(connection, heartbeatAt, feedNow)

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

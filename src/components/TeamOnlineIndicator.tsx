import { useTeamOnline } from '@/hooks/queries'
import { useI18n } from '@/i18n'
import { formatTime } from '@/lib/time'
import { cn, fmt } from '@/lib/utils'

export function TeamOnlineIndicator({ compact, className }: { compact?: boolean; className?: string }) {
  const { t } = useI18n()
  const { online, heartbeatAt } = useTeamOnline()
  const label = online ? t.common.team.online : heartbeatAt ? fmt(t.common.team.offlineSince, { time: formatTime(heartbeatAt) }) : t.common.team.offline
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', online ? 'text-done' : 'text-muted-foreground', className)} title={compact ? label : undefined}>
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', online ? 'bg-done text-done animate-pulse-dot' : 'bg-idle')} />
      <span className={cn(compact && 'sr-only')}>{label}</span>
    </span>
  )
}

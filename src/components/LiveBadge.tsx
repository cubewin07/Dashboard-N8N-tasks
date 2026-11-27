import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useBackendConnection, useFeedPhase, useOffice, worstConnection } from '@/office'

export function LiveBadge({ className }: { className?: string }) {
  const { t } = useI18n()
  const officeConn = useOffice((s) => s.connection)
  const backendConn = useBackendConnection()
  const phase = useFeedPhase()
  // Before the first snapshot nothing is live yet: say so instead of a green "Trực tuyến".
  const conn = phase === 'connecting' ? 'connecting' : worstConnection(officeConn, backendConn)

  const cfg = {
    connecting: {
      dot: 'bg-idle',
      text: 'text-muted-foreground',
      label: t.common.live.connecting,
    },
    live: {
      dot: 'bg-done animate-pulse-dot text-done',
      text: 'text-done',
      label: t.common.live.live,
    },
    reconnecting: {
      dot: 'bg-waiting text-waiting',
      text: 'text-waiting',
      label: t.common.live.reconnecting,
    },
    offline: {
      dot: 'bg-blocked text-blocked',
      text: 'text-blocked',
      label: t.common.live.offlineShort,
    },
  }[conn]

  return (
    <span
      role="status"
      data-live-badge={conn}
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium',
        cfg.text,
        className,
      )}
    >
      <span aria-hidden className={cn('size-2 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

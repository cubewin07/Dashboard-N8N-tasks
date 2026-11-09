import { useConnection } from '@/app/RealtimeProvider'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

export function LiveBadge({ className }: { className?: string }) {
  const { t } = useI18n()
  const conn = useConnection()
  const cfg = {
    live: { dot: 'bg-done animate-pulse-dot text-done', text: 'text-done', label: t.common.live.live },
    reconnecting: { dot: 'bg-waiting text-waiting', text: 'text-waiting', label: t.common.live.reconnecting },
    offline: { dot: 'bg-blocked text-blocked', text: 'text-blocked', label: t.common.live.offlineShort },
  }[conn]
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium', cfg.text, className)}>
      <span aria-hidden className={cn('size-2 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

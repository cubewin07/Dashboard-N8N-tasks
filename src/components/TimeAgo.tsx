import { useNow } from '@/hooks/useNow'
import { useI18n } from '@/i18n'
import { formatDateTime, relative } from '@/lib/time'
import { cn } from '@/lib/utils'

export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  const { t, lang } = useI18n()
  const now = useNow(30_000)
  return (
    <time dateTime={iso} title={formatDateTime(iso, lang)} className={cn('tabular', className)}>
      {relative(iso, t.common.time, now)}
    </time>
  )
}

import { useNow } from '@/hooks/useNow'
import { useI18n } from '@/i18n'
import { formatDateTime, relative } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useIsLegacyRoute, useOffice } from '@/office'

export function TimeAgo({
  iso,
  now: baseNow,
  className,
}: {
  iso: string
  now?: string | Date
  className?: string
}) {
  const { t, lang } = useI18n()
  const isLegacy = useIsLegacyRoute()
  const feedNow = useOffice((s) => s.state?.now ?? null)
  const wallNow = useNow(30_000)

  const resolvedBase = baseNow
    ? typeof baseNow === 'string'
      ? new Date(baseNow)
      : baseNow
    : !isLegacy && feedNow
      ? new Date(feedNow)
      : wallNow

  return (
    <time
      dateTime={iso}
      title={formatDateTime(iso, lang)}
      className={cn('tabular', className)}
    >
      {relative(iso, t.common.time, resolvedBase)}
    </time>
  )
}

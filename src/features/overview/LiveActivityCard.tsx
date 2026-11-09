import { Link } from 'react-router-dom'
import { EmployeeAvatar } from '@/components'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { OwnerKey, Tables } from '@/lib/database.types'
import { formatTime } from '@/lib/time'
import { useI18n } from '@/i18n'
import { formatEventMessage } from './overviewUtils'

interface LiveActivityCardProps {
  events: Tables<'events'>[]
  employeeMap: Map<string, Tables<'employees'>>
}

const VALID_OWNERS = new Set<OwnerKey>(['thu', 'mai', 'linh', 'ha', 'vy', 'an', 'bao', 'boss'])

function toOwnerKey(actor: string): OwnerKey {
  return VALID_OWNERS.has(actor as OwnerKey) ? (actor as OwnerKey) : 'thu'
}

export function LiveActivityCard({ events, employeeMap }: LiveActivityCardProps) {
  const { t } = useI18n()

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle>{t.overview.activity.title}</CardTitle>
        <Link
          to="/tasks"
          className="text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring sm:text-sm"
        >
          {t.overview.activity.viewAll}
        </Link>
      </CardHeader>
      <CardContent className="flex-1">
        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t.overview.activity.empty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/70">
            {events.map((ev) => {
              const ownerKey = toOwnerKey(ev.actor)
              const actorName = ownerKey === 'boss' ? t.common.you : (employeeMap.get(ownerKey)?.name ?? ev.actor)
              const line = formatEventMessage(ev, t, employeeMap)
              return (
                <li key={ev.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
                  <time dateTime={ev.at} className="tabular w-11 shrink-0 pt-1 text-xs text-muted-foreground">
                    {formatTime(ev.at)}
                  </time>
                  <EmployeeAvatar ownerKey={ownerKey} size="sm" className="mt-0.5" />
                  <div className="min-w-0 flex-1 text-sm leading-snug">
                    <span className="font-medium text-foreground">{actorName}</span>{' '}
                    {ev.task_id ? (
                      <Link
                        to={`/tasks/${ev.task_id}`}
                        className="text-muted-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {line}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{line}</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

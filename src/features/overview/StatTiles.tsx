import { Link } from 'react-router-dom'
import { ToneMark } from '@/components'
import type { Tables } from '@/lib/database.types'
import { toneClasses, type Tone } from '@/lib/status'
import { isTodayICT } from '@/lib/time'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

export function StatTiles({ tasks }: { tasks: Tables<'tasks'>[] }) {
  const { t } = useI18n()

  const workingCount = tasks.filter((task) => task.status === 'running' || task.status === 'queued').length
  const waitingCount = tasks.filter((task) => task.status === 'waiting_boss').length
  const blockedCount = tasks.filter((task) => task.status === 'blocked').length
  const doneTodayCount = tasks.filter((task) => task.status === 'done' && task.finished_at && isTodayICT(task.finished_at)).length

  const tiles: {
    key: string
    label: string
    hint: string
    count: number
    tone: Tone
    to: string
  }[] = [
    {
      key: 'working',
      label: t.overview.stats.working,
      hint: t.overview.stats.workingHint,
      count: workingCount,
      tone: 'working',
      to: '/tasks?tab=active',
    },
    {
      key: 'waiting',
      label: t.overview.stats.waiting,
      hint: t.overview.stats.waitingHint,
      count: waitingCount,
      tone: 'waiting',
      to: '/tasks?tab=waiting',
    },
    {
      key: 'blocked',
      label: t.overview.stats.blocked,
      hint: t.overview.stats.blockedHint,
      count: blockedCount,
      tone: 'blocked',
      to: '/tasks?tab=blocked',
    },
    {
      key: 'doneToday',
      label: t.overview.stats.doneToday,
      hint: t.overview.stats.doneTodayHint,
      count: doneTodayCount,
      tone: 'done',
      to: '/tasks?tab=done',
    },
  ]

  return (
    <section aria-label={t.overview.title} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => {
        const tc = toneClasses[tile.tone]
        return (
          <Link
            key={tile.key}
            to={tile.to}
            className="group flex flex-col justify-between gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-soft)] transition-colors hover:border-primary/40 hover:bg-surface-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground sm:text-sm">{tile.label}</span>
              <span className={cn('inline-flex size-6 items-center justify-center rounded-full', tc.bg, tc.text)}>
                <ToneMark tone={tile.tone} />
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn('tabular text-2xl font-semibold tracking-tight sm:text-3xl', tile.count > 0 ? tc.text : 'text-foreground')}>
                {tile.count}
              </span>
            </div>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">{tile.hint}</p>
          </Link>
        )
      })}
    </section>
  )
}

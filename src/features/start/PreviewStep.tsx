import { Clock, Sparkles, Star } from 'lucide-react'
import type { Tables } from '@/lib/database.types'
import { EmployeeAvatar } from '@/components'
import { useI18n } from '@/i18n'
import { cn, fmt } from '@/lib/utils'

export interface Availability {
  name: string
  free: boolean
  ahead: number
}

/** Step ③: what will run, who does each step, and whether the first owner is free. */
export function PreviewStep({
  steps,
  employees,
  requireApproval,
  brief,
  availability,
}: {
  steps: Tables<'workflow_steps'>[]
  employees: Map<string, Tables<'employees'>>
  requireApproval: boolean
  brief: string
  availability: Availability | null
}) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-4">
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.start.preview.noSteps}</p>
      ) : (
        <ol role="list" className="flex flex-col divide-y divide-border rounded-[var(--radius-card)] border border-border">
          {steps.map((s, i) => {
            const isApproval = s.kind === 'approval'
            const skipped = isApproval && !requireApproval
            const ownerName = s.owner_key === 'boss' ? t.common.you : (employees.get(s.owner_key)?.name ?? s.owner_key)
            const label = t.common.steps[s.key] ?? s.label
            return (
              <li key={s.key} className={cn('flex items-center gap-3 px-3 py-2.5', skipped && 'text-muted-foreground')}>
                <span
                  aria-hidden
                  className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold tabular-nums', skipped && 'opacity-60')}
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex flex-wrap items-center gap-x-1.5">
                    <span className={cn('font-medium', skipped ? 'line-through decoration-1' : 'text-foreground')}>{label}</span>
                    {s.risky && (
                      <span className="inline-flex items-center text-waiting" title={t.start.preview.riskyHint}>
                        <Star className="size-3.5 fill-current" aria-hidden />
                        <span className="sr-only">{t.common.risky}</span>
                      </span>
                    )}
                  </span>
                  {isApproval && (
                    <span className="text-xs text-muted-foreground">{skipped ? t.start.preview.skipped : t.start.preview.skippedIfOff}</span>
                  )}
                </span>
                <span className={cn('flex shrink-0 items-center gap-2 text-sm', skipped && 'opacity-60')}>
                  <EmployeeAvatar ownerKey={s.owner_key} size="sm" />
                  <span className={skipped ? '' : 'text-foreground'}>{ownerName}</span>
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {brief.trim() && (
        <div className="rounded-[var(--radius-card)] bg-surface-muted/60 px-3 py-2.5 text-sm">
          <p className="text-xs font-medium text-muted-foreground">{t.start.preview.brief}</p>
          <p className="mt-0.5 whitespace-pre-line break-words text-foreground">{brief.trim()}</p>
        </div>
      )}

      {availability && (
        <p className={cn('inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-sm font-medium', availability.free ? 'bg-done-soft text-done' : 'bg-waiting-soft text-waiting')}>
          {availability.free ? <Sparkles className="size-4" aria-hidden /> : <Clock className="size-4" aria-hidden />}
          {availability.free ? fmt(t.start.preview.free, { name: availability.name }) : fmt(t.start.preview.busy, { name: availability.name, n: availability.ahead })}
        </p>
      )}
    </div>
  )
}

import { Check, Circle, CornerDownRight, Loader2, Star, X } from 'lucide-react'
import type { StepStatus, Tables } from '@/lib/database.types'
import { stepStatusTone, toneClasses } from '@/lib/status'
import { useLookups } from '@/hooks/queries'
import { useI18n } from '@/i18n'
import { formatTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { EmployeeAvatar } from './EmployeeAvatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

function StepIcon({ status }: { status: StepStatus }) {
  const tc = toneClasses[stepStatusTone[status]]
  const box = cn('relative z-10 inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 bg-surface', tc.text)
  switch (status) {
    case 'done':
      return (
        <span className={cn(box, 'border-done bg-done text-primary-foreground')}>
          <Check className="size-4" strokeWidth={3} aria-hidden />
        </span>
      )
    case 'running':
      return (
        <span className={cn(box, 'border-working animate-pulse-dot')}>
          <Loader2 className="size-4 animate-spin" aria-hidden />
        </span>
      )
    case 'failed':
    case 'stuck':
      return (
        <span className={cn(box, 'border-blocked bg-blocked text-primary-foreground')}>
          <X className="size-4" strokeWidth={3} aria-hidden />
        </span>
      )
    case 'skipped':
      return (
        <span className={cn(box, 'border-dashed border-idle')}>
          <CornerDownRight className="size-3.5" aria-hidden />
        </span>
      )
    default:
      return (
        <span className={cn(box, 'border-border')}>
          <Circle className="size-2.5" aria-hidden />
        </span>
      )
  }
}

export function StepTimeline({ taskSteps, workflowKey, className }: { taskSteps: Tables<'task_steps'>[]; workflowKey?: string; className?: string }) {
  const { t } = useI18n()
  const { employee, stepsByWorkflow } = useLookups()
  const defs = workflowKey ? (stepsByWorkflow.get(workflowKey) ?? []) : []
  const steps = [...taskSteps].sort((a, b) => a.position - b.position)

  return (
    <TooltipProvider delayDuration={200}>
      <ol className={cn('flex flex-col', className)}>
        {steps.map((s, i) => {
          const risky = defs.find((d) => d.key === s.step_key)?.risky ?? false
          const ownerName = s.owner_key === 'boss' ? t.common.you : (employee.get(s.owner_key)?.name ?? s.owner_key)
          const time = s.finished_at ?? s.started_at
          const isLast = i === steps.length - 1
          return (
            <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0">
              {!isLast && <span aria-hidden className={cn('absolute left-3.5 top-7 -ml-px h-[calc(100%-1.75rem)] w-0.5', s.status === 'done' ? 'bg-done/40' : 'bg-border')} />}
              <StepIcon status={s.status} />
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{t.common.steps[s.step_key] ?? s.step_key}</span>
                  {risky && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label={t.common.risky} className="inline-flex size-6 items-center justify-center rounded-md text-waiting focus-visible:outline-2 focus-visible:outline-ring">
                          <Star className="size-3.5" fill="currentColor" aria-hidden />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t.common.risky}</TooltipContent>
                    </Tooltip>
                  )}
                  <span className="sr-only">{t.common.stepStatus[s.status]}</span>
                  {time && (
                    <time dateTime={time} className="tabular ml-auto text-xs text-muted-foreground">
                      {formatTime(time)}
                    </time>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <EmployeeAvatar ownerKey={s.owner_key} size="sm" />
                  <span>{ownerName}</span>
                </div>
                {s.summary && <p className="mt-1.5 text-sm text-muted-foreground">{s.summary}</p>}
                {s.error && <p className="mt-1.5 text-sm text-blocked">{s.error}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </TooltipProvider>
  )
}

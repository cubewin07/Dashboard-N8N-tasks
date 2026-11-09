import { X } from 'lucide-react'
import type { OwnerKey, StepStatus } from '@/lib/database.types'
import { ownerTint, toneClasses } from '@/lib/status'
import { useI18n } from '@/i18n'
import { cn, fmt } from '@/lib/utils'

export interface StepDotItem {
  status: StepStatus
  owner_key: OwnerKey
  step_key: string
}

/** 1-based index of the first step that isn't finished (done/skipped); total when all finished. */
export function currentStepNumber(steps: StepDotItem[]) {
  const i = steps.findIndex((s) => s.status !== 'done' && s.status !== 'skipped')
  return i === -1 ? steps.length : i + 1
}

function Dot({ step }: { step: StepDotItem }) {
  const isApproval = step.owner_key === 'boss'
  const shape = isApproval ? 'size-2.5 rotate-45 rounded-[2px]' : 'size-2.5 rounded-full'
  switch (step.status) {
    case 'done':
      return <span className={cn(shape, ownerTint[step.owner_key].solid)} />
    case 'running':
      return (
        <span
          className={cn(shape, 'border-2 animate-pulse-dot', toneClasses.working.text, 'border-working')}
          style={{ background: 'linear-gradient(90deg, currentColor 50%, transparent 50%)' }}
        />
      )
    case 'failed':
    case 'stuck':
      return (
        <span className={cn('inline-flex size-3.5 items-center justify-center rounded-full bg-blocked text-primary-foreground', isApproval && 'rounded-[3px]')}>
          <X className="size-2.5" strokeWidth={4} />
        </span>
      )
    case 'skipped':
      return <span className={cn(shape, 'border border-dashed border-idle')} />
    default:
      return <span className={cn(shape, 'border-2 border-border bg-surface')} />
  }
}

export function StepDots({ steps, showCount, className }: { steps: StepDotItem[]; showCount?: boolean; className?: string }) {
  const { t } = useI18n()
  const label = (s: StepDotItem) => `${t.common.steps[s.step_key] ?? s.step_key}: ${t.common.stepStatus[s.status]}`
  const count = fmt(t.common.stepOf, { n: currentStepNumber(steps), total: steps.length })
  const summary = [count, ...steps.map(label)].join('; ')

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span role="img" aria-label={summary} className="inline-flex items-center gap-1.5">
        {steps.map((s, i) => (
          <span key={`${s.step_key}-${i}`} title={label(s)} className="inline-flex size-3.5 items-center justify-center">
            <Dot step={s} />
          </span>
        ))}
      </span>
      {showCount && (
        <span aria-hidden className="tabular text-xs text-muted-foreground">
          {count}
        </span>
      )}
    </span>
  )
}

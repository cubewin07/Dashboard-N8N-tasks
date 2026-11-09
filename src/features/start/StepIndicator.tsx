import { Check } from 'lucide-react'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

export type WizardStep = 0 | 1 | 2
const STEP_KEYS = ['what', 'where', 'preview'] as const

/** ① Việc gì? ② Ở đâu? ③ Xem trước. Completed steps are buttons that jump back. */
export function StepIndicator({ current, onJump }: { current: WizardStep; onJump: (step: WizardStep) => void }) {
  const { t } = useI18n()
  return (
    <nav aria-label={t.start.stepsLabel}>
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {STEP_KEYS.map((key, i) => {
          const step = i as WizardStep
          const done = step < current
          const active = step === current
          const label = t.start.wizardSteps[key]
          const marker = (
            <span
              className={cn(
                'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors',
                active && 'bg-primary text-primary-foreground',
                done && 'bg-primary-soft text-primary',
                !active && !done && 'bg-surface-muted text-muted-foreground',
              )}
              aria-hidden
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
          )
          const text = <span className={cn('truncate text-sm', active ? 'font-semibold text-foreground' : 'text-muted-foreground', !active && 'max-sm:sr-only')}>{label}</span>
          return (
            <li key={key} aria-current={active ? 'step' : undefined} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              {i > 0 && <span aria-hidden className={cn('h-px w-4 shrink-0 sm:w-6', done || active ? 'bg-primary/40' : 'bg-border')} />}
              {done ? (
                <button
                  type="button"
                  onClick={() => onJump(step)}
                  className="flex min-h-8 min-w-0 items-center gap-1.5 rounded-lg px-1 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-ring sm:gap-2"
                >
                  {marker}
                  {text}
                </button>
              ) : (
                <span className="flex min-h-8 min-w-0 items-center gap-1.5 px-1 sm:gap-2">
                  {marker}
                  {text}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

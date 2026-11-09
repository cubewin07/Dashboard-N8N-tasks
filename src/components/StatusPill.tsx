import { Check, Circle, Diamond, X } from 'lucide-react'
import type { EmpStatus, StepStatus, TaskStatus } from '@/lib/database.types'
import { empStatusTone, stepStatusTone, taskStatusTone, toneClasses, type Tone } from '@/lib/status'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

type Kind = 'emp' | 'task' | 'step'

/** Shape per tone so status is never conveyed by colour alone. */
export function ToneMark({ tone, className }: { tone: Tone; className?: string }) {
  const c = cn('size-3 shrink-0', className)
  switch (tone) {
    case 'working':
      return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full animate-pulse-dot', toneClasses.working.dot, className)} />
    case 'waiting':
      return <Diamond aria-hidden className={c} fill="currentColor" />
    case 'blocked':
      return <X aria-hidden className={c} strokeWidth={3} />
    case 'done':
      return <Check aria-hidden className={c} strokeWidth={3} />
    default:
      return <Circle aria-hidden className={c} strokeWidth={2.5} />
  }
}

type Common = ReturnType<typeof useI18n>['t']['common']

function resolve(kind: Kind, status: string, c: Common): [Tone, string] {
  if (kind === 'emp') return [empStatusTone[status as EmpStatus] ?? 'idle', c.empStatus[status as EmpStatus] ?? status]
  if (kind === 'task') return [taskStatusTone[status as TaskStatus] ?? 'idle', c.taskStatus[status as TaskStatus] ?? status]
  return [stepStatusTone[status as StepStatus] ?? 'idle', c.stepStatus[status as StepStatus] ?? status]
}

export function StatusPill({ kind, status, className, size = 'md' }: { kind: Kind; status: string; className?: string; size?: 'sm' | 'md' }) {
  const { t } = useI18n()
  const [tone, label] = resolve(kind, status, t.common)
  const tc = toneClasses[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs sm:text-sm',
        tc.bg,
        tc.text,
        tc.border,
        className,
      )}
    >
      <ToneMark tone={tone} />
      {label}
    </span>
  )
}

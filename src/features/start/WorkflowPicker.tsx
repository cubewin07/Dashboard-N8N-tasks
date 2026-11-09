import { Check, PlugZap } from 'lucide-react'
import type { Tables } from '@/lib/database.types'
import { WorkflowIcon } from '@/components'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

export const isStartable = (w: Tables<'workflows'>) => w.enabled && w.n8n_workflow_ref !== null

/** Step ①: radio-like tiles, one per workflow. Not-connected workflows are shown but can't be picked. */
export function WorkflowPicker({
  workflows,
  loading,
  value,
  onChange,
  labelledBy,
}: {
  workflows: Tables<'workflows'>[]
  loading: boolean
  value: string | null
  onChange: (key: string) => void
  labelledBy: string
}) {
  const { t } = useI18n()

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-[var(--radius-card)]" />
        ))}
      </div>
    )
  }
  if (workflows.length === 0) return <p className="text-sm text-muted-foreground">{t.start.what.none}</p>

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {workflows.map((w) => {
        const startable = isStartable(w)
        const selected = value === w.key
        const name = t.common.workflows[w.key as keyof typeof t.common.workflows]?.name ?? w.name
        const description = t.start.descriptions[w.key] ?? w.description ?? t.start.descriptionFallback
        return (
          <button
            key={w.key}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!startable}
            title={startable ? undefined : t.start.what.notConnectedHint}
            onClick={() => onChange(w.key)}
            className={cn(
              'group relative flex min-h-[76px] items-start gap-3 rounded-[var(--radius-card)] border bg-surface p-3 text-left transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              selected ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/40 hover:bg-surface-muted',
              !startable && 'cursor-not-allowed opacity-60 hover:border-border hover:bg-surface',
            )}
          >
            <span
              className={cn(
                'inline-flex size-9 shrink-0 items-center justify-center rounded-xl',
                selected ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-foreground',
              )}
            >
              <WorkflowIcon workflowKey={w.key} className="size-[18px]" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-foreground">{name}</span>
                {!startable && (
                  <Badge variant="neutral">
                    <PlugZap className="size-3" aria-hidden />
                    {t.common.workflowNotConnected}
                  </Badge>
                )}
              </span>
              <span className="text-sm leading-snug text-muted-foreground">{description}</span>
            </span>
            {selected && (
              <span aria-hidden className="absolute right-2.5 top-2.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" strokeWidth={3} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

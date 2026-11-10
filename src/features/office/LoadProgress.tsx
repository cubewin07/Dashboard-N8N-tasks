import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'

export interface LoadProgressProps {
  progress: { done: number; total: number; settled: boolean }
}

/** Thin, non-blocking note while furniture streams in (P06b R8). */
export function LoadProgress({ progress }: LoadProgressProps) {
  const { t } = useI18n()
  if (progress.settled || progress.total === 0) return <span />
  const percent = Math.round((progress.done / progress.total) * 100)

  return (
    <div
      role="status"
      data-load-progress
      className="pointer-events-none flex w-56 flex-col gap-1.5 rounded-[10px] border border-border bg-surface/85 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur-md"
    >
      <span>{fmt(t.office.assetsLoading, { percent })}</span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </span>
    </div>
  )
}

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

/** Shown instead of an endless skeleton when the config or the feed failed to boot. */
export function LoadErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div
      role="alert"
      data-load-error
      className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border px-6 py-10 text-center"
    >
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-medium text-foreground">{t.common.error.loadTitle}</p>
        <p className="text-sm text-muted-foreground">{t.common.error.loadHint}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="size-4" aria-hidden />
        <span>{t.common.actions.retry}</span>
      </Button>
    </div>
  )
}

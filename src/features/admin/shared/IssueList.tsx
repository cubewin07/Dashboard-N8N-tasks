import { AlertTriangle, CircleAlert } from 'lucide-react'
import type { ConfigIssue } from '@/domain/validateConfig'
import { useI18n, type Messages } from '@/i18n'
import { fmt } from '@/lib/utils'

export function issueMessage(t: Messages, issue: ConfigIssue): string {
  const template = t.adminIssues.codes[issue.code] ?? t.adminIssues.codes.schema ?? issue.code
  return fmt(template, { message: '', ...issue.params })
}

/** Validation issues, errors first. Renders nothing when empty. */
export function IssueList({ issues, id }: { issues: readonly ConfigIssue[]; id?: string }) {
  const { t } = useI18n()
  if (issues.length === 0) return null
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')
  return (
    <div id={id} className="space-y-3" aria-live="polite">
      {errors.length > 0 && (
        <div role="alert" className="rounded-xl border border-blocked/40 bg-blocked-soft p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-blocked">
            <CircleAlert className="size-4" aria-hidden />
            {t.admin.issues.errorsTitle}
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-6 text-sm">
            {errors.map((i, idx) => (
              <li key={`${i.code}-${idx}`}>{issueMessage(t, i)}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-muted p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4 text-muted-foreground" aria-hidden />
            {t.admin.issues.warningsTitle}
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-6 text-sm text-muted-foreground">
            {warnings.map((i, idx) => (
              <li key={`${i.code}-${idx}`}>{issueMessage(t, i)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

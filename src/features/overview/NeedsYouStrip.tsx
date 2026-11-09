import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useInboxCount } from '@/hooks/queries'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'

export function NeedsYouStrip() {
  const { t } = useI18n()
  const { total, approvals, questions, blocked } = useInboxCount()

  if (total === 0) return null

  return (
    <section
      aria-label={fmt(t.overview.needsYou.title, { n: total })}
      className="animate-fade-in flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-waiting/30 bg-waiting-soft px-4 py-3 text-foreground shadow-[var(--shadow-soft)]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-waiting">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span className="tabular">{fmt(t.overview.needsYou.title, { n: total })}</span>
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {approvals > 0 && (
            <span className="tabular inline-flex items-center rounded-full border border-waiting/30 bg-surface px-2.5 py-0.5 text-xs font-medium text-waiting">
              {fmt(t.overview.needsYou.approvals, { n: approvals })}
            </span>
          )}
          {questions > 0 && (
            <span className="tabular inline-flex items-center rounded-full border border-waiting/30 bg-surface px-2.5 py-0.5 text-xs font-medium text-waiting">
              {fmt(t.overview.needsYou.questions, { n: questions })}
            </span>
          )}
          {blocked > 0 && (
            <span className="tabular inline-flex items-center rounded-full border border-blocked/30 bg-surface px-2.5 py-0.5 text-xs font-medium text-blocked">
              {fmt(t.overview.needsYou.blocked, { n: blocked })}
            </span>
          )}
        </div>
      </div>

      <Link
        to="/inbox"
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-semibold text-waiting transition-colors hover:bg-surface/70 focus-visible:outline-2 focus-visible:outline-ring"
      >
        {t.overview.needsYou.openInbox}
      </Link>
    </section>
  )
}

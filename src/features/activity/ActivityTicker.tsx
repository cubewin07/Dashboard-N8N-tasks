import { Activity, ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TimeAgo } from '@/components'
import { activitySentenceParts } from '@/domain/selectors'
import { useI18n } from '@/i18n'
import { useOfficeSelector } from '@/office/hooks'
import { formatActivitySentence } from './formatActivity'

export function ActivityTicker() {
  const { t, lang } = useI18n()
  const state = useOfficeSelector((s) => s)
  const [expanded, setExpanded] = useState(false)

  const recent = useMemo(() => {
    if (!state || state.log.length === 0) return []
    return state.log
      .slice(-4)
      .reverse()
      .map((evt) => ({
        parts: activitySentenceParts(evt, state),
        sentence: formatActivitySentence(
          activitySentenceParts(evt, state),
          t,
          lang,
          state,
        ),
      }))
  }, [state, t, lang])

  if (recent.length === 0) return null

  return (
    <div
      data-activity-ticker
      className="pointer-events-auto hidden w-80 rounded-xl border border-border bg-surface/90 p-2.5 shadow-sm backdrop-blur lg:block"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-semibold text-foreground"
        >
          <Activity className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="truncate">
            {expanded ? t.activity.tickerTitle : recent[0]!.sentence}
          </span>
          {expanded ? (
            <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronUp className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
          {recent.map(({ parts, sentence }) => (
            <div
              key={parts.eventId}
              className="flex items-start justify-between gap-2 text-xs"
            >
              <span className="line-clamp-2 text-foreground">{sentence}</span>
              <TimeAgo
                iso={parts.at}
                className="shrink-0 text-[11px] text-muted-foreground"
              />
            </div>
          ))}
          <div className="pt-1 text-right">
            <Link
              to="/activity"
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              {t.activity.viewAllLink}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

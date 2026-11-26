// P10-T14 · Nhật ký thay đổi (R13): config changes, newest first, with a readable before → after.
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { EmptyState } from '@/components'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ConfigAuditEntry } from '@/domain/configChange'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { loadConfigHistory } from '@/office/configStore'
import { useConfig } from '@/office/hooks'
import { HistoryEntryRow } from '../history/HistoryEntryRow'

type HistoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; entries: ConfigAuditEntry[] }

const LIMIT = 200

export function HistoryTab() {
  const { t } = useI18n()
  const th = t.adminRules.history
  const { config } = useConfig()
  const [state, setState] = useState<HistoryState>({ status: 'loading' })
  const request = useRef(0)

  // State is only set in the promise callbacks, so it is safe to call from an effect.
  const fetchEntries = useCallback(() => {
    const mine = (request.current += 1)
    loadConfigHistory(LIMIT).then(
      (entries) => {
        if (request.current === mine) setState({ status: 'ready', entries })
      },
      () => {
        if (request.current === mine) setState({ status: 'error' })
      },
    )
  }, [])

  const load = useCallback(() => {
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }))
    fetchEntries()
  }, [fetchEntries])

  // Load on open, and again whenever the config changes (a save from another tab or a realtime echo).
  useEffect(() => {
    fetchEntries()
  }, [fetchEntries, config])

  return (
    <section aria-labelledby="history-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="history-title" className="text-lg font-semibold">
            {th.title}
          </h2>
          <p className="text-sm text-muted-foreground">{th.description}</p>
        </div>
        <Button type="button" variant="outline" onClick={load} disabled={state.status === 'loading'}>
          <RefreshCw className={state.status === 'loading' ? 'animate-spin' : undefined} aria-hidden />
          {th.refresh}
        </Button>
      </div>

      {state.status === 'loading' && (
        <div className="space-y-3" aria-busy="true" role="status">
          <span className="sr-only">{th.loading}</span>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="space-y-3 rounded-xl border border-blocked/40 bg-blocked-soft p-4">
          <p className="text-sm font-medium text-blocked">{th.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={load}>
            {th.retry}
          </Button>
        </div>
      )}

      {state.status === 'ready' &&
        (state.entries.length === 0 ? (
          <EmptyState title={th.empty} description={th.emptyHint} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{fmt(th.count, { count: state.entries.length })}</p>
            <ol className="space-y-3" data-testid="history-list">
              {state.entries.map((entry) => (
                <HistoryEntryRow key={entry.id} entry={entry} />
              ))}
            </ol>
          </>
        ))}
    </section>
  )
}

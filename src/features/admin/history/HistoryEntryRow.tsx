import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import type { ConfigAuditEntry } from '@/domain/configChange'
import { useI18n } from '@/i18n'
import { formatDateTime } from '@/lib/time'
import { fmt } from '@/lib/utils'
import { diffPaths, formatValue } from './diff'

const MAX_ROWS = 20

const ACTION_VARIANT: Record<string, 'primary' | 'blocked' | 'waiting' | 'done' | 'neutral'> = {
  upsert: 'primary',
  delete: 'blocked',
  archive: 'waiting',
  restore: 'done',
  reorder: 'neutral',
  replace: 'waiting',
}

function pretty(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2)
}

/** One change: when, who, what, and the changed fields as before → after (full JSON collapsed). */
export function HistoryEntryRow({ entry }: { entry: ConfigAuditEntry }) {
  const { t, lang } = useI18n()
  const th = t.adminRules.history
  const entities: Record<string, string> = th.entities
  const actions: Record<string, string> = th.actions

  const changes = useMemo(
    () => (entry.before == null || entry.after == null ? [] : diffPaths(entry.before, entry.after)),
    [entry.before, entry.after],
  )
  const created = entry.before == null && entry.after != null
  const removed = entry.before != null && entry.after == null
  const shown = changes.slice(0, MAX_ROWS)

  return (
    <li
      className="space-y-2 rounded-[var(--radius-card)] border border-border bg-surface p-4"
      data-testid="history-entry"
      data-entity={entry.entity}
      data-action={entry.action}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant={ACTION_VARIANT[entry.action] ?? 'neutral'}>{actions[entry.action] ?? entry.action}</Badge>
        <span className="font-medium">{entities[entry.entity] ?? entry.entity}</span>
        <code className="text-xs text-muted-foreground">{entry.entityId === '*' ? th.allItems : entry.entityId}</code>
      </div>
      <p className="text-sm text-muted-foreground">
        <time dateTime={entry.at}>{formatDateTime(entry.at, lang)}</time>
        {' · '}
        {entry.actor?.name ?? th.system}
      </p>

      {created && <p className="text-sm">{th.created}</p>}
      {removed && <p className="text-sm">{th.removed}</p>}
      {shown.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium">{th.changedFields}</p>
          <ul className="space-y-1 text-sm">
            {shown.map((c) => (
              <li key={c.path} className="break-words">
                <code className="text-xs text-muted-foreground">{c.path === '' ? entry.entity : c.path}</code>
                {': '}
                <span className="text-blocked">{formatValue(c.before, th.empty_value)}</span>
                {' → '}
                <span className="text-done">{formatValue(c.after, th.empty_value)}</span>
              </li>
            ))}
          </ul>
          {changes.length > shown.length && (
            <p className="text-xs text-muted-foreground">
              {fmt(th.more, { count: changes.length - shown.length })}
            </p>
          )}
        </div>
      )}
      {!created && !removed && changes.length === 0 && <p className="text-sm text-muted-foreground">{th.noDiff}</p>}

      <details className="text-sm">
        <summary className="cursor-pointer rounded text-primary focus-visible:outline-2 focus-visible:outline-ring">
          {th.json}
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{th.before}</p>
            <pre className="max-h-64 overflow-auto rounded-lg bg-surface-muted p-2 text-xs">{pretty(entry.before) || th.empty_value}</pre>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{th.after}</p>
            <pre className="max-h-64 overflow-auto rounded-lg bg-surface-muted p-2 text-xs">{pretty(entry.after) || th.empty_value}</pre>
          </div>
        </div>
      </details>
    </li>
  )
}

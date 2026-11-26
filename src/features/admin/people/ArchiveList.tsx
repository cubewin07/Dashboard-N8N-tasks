import { Loader2, Undo2 } from 'lucide-react'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { Employee, OrgConfig } from '@/domain/config'
import { useI18n } from '@/i18n'
import { formatDateTime } from '@/lib/time'
import { fmt } from '@/lib/utils'
import { useLabel } from '@/office/hooks'
import { IssueList } from '../shared/IssueList'
import { useConfigEdit } from '../shared/useConfigEdit'
import { archivedPeople } from './peopleModel'
import { useChangeIssues } from './useChangeIssues'

/**
 * The archive does not store why someone left (the config has only `archivedAt`), so the reason is
 * inferred: core staff are only ever dismissed; temps can also be dropped by the cap.
 */
export function archiveReasonKey(e: Employee): 'dismissed' | 'unknown' {
  return e.kind === 'core' ? 'dismissed' : 'unknown'
}

function ArchivedRow({ person, roleLabel }: { person: Employee; roleLabel: string }) {
  const { t, lang } = useI18n()
  const p = t.adminPeople.people
  const { status, save } = useConfigEdit()
  const { issues, blocking } = useChangeIssues({ kind: 'employee.restore', id: person.id })
  const reasonId = `archive-issues-${person.id}`

  const restore = async () => {
    if (await save({ kind: 'employee.restore', id: person.id })) {
      toast.success(fmt(p.restore.done, { name: person.name }))
    }
  }

  return (
    <li
      data-employee-id={person.id}
      data-archived-person
      className="space-y-2 rounded-xl border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{person.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {roleLabel} · {p.kind[person.kind]}
          </p>
        </div>
        <dl className="grid flex-1 grid-cols-2 gap-x-4 text-xs">
          <div>
            <dt className="text-muted-foreground">{p.archive.when}</dt>
            <dd className="tabular">
              {person.archivedAt ? formatDateTime(person.archivedAt, lang) : p.archive.unknownDate}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{p.archive.why}</dt>
            <dd>{p.archive.reason[archiveReasonKey(person)]}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={blocking || status === 'saving'}
            aria-describedby={blocking ? reasonId : undefined}
            aria-label={fmt(p.actions.forPerson, { action: p.actions.restore, name: person.name })}
            onClick={() => void restore()}
          >
            {status === 'saving' ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />}
            {p.actions.restore}
          </Button>
        </div>
      </div>
      {blocking && <IssueList id={reasonId} issues={issues} />}
    </li>
  )
}

export function ArchiveList({ config }: { config: OrgConfig }) {
  const { t } = useI18n()
  const p = t.adminPeople.people
  const label = useLabel()
  const archived = useMemo(() => archivedPeople(config), [config])
  const roles = useMemo(() => new Map(config.roles.map((r) => [r.key, r])), [config.roles])

  return (
    <section aria-labelledby="admin-archive-title" className="space-y-3" data-admin-archive>
      <div>
        <h3 id="admin-archive-title" className="text-base font-semibold">
          {p.archive.title} ({archived.length})
        </h3>
        <p className="text-sm text-muted-foreground">{p.archive.description}</p>
      </div>
      {archived.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          {p.archive.empty}
        </p>
      ) : (
        <ul className="space-y-2" aria-label={p.archive.title}>
          {archived.map((e) => {
            const role = roles.get(e.roleKey)
            return <ArchivedRow key={e.id} person={e} roleLabel={role ? label(role.label) : e.roleKey} />
          })}
        </ul>
      )}
    </section>
  )
}

import { UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Employee } from '@/domain/config'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useConfig } from '@/office/hooks'
import { ArchiveList } from '../people/ArchiveList'
import { DismissDialog } from '../people/DismissDialog'
import { PeopleFiltersBar } from '../people/PeopleFilters'
import { PeopleList } from '../people/PeopleList'
import { DEFAULT_FILTERS, filterPeople, type PeopleFilters } from '../people/peopleModel'
import { PersonEditor } from '../people/PersonEditor'

type Editor = { mode: 'hire' } | { mode: 'edit'; id: string }

/** Quản trị → Nhân sự (P10-T07, R5): hire, edit, dismiss, restore, archive list. */
export function PeopleTab() {
  const { t } = useI18n()
  const p = t.adminPeople.people
  const { config } = useConfig()
  const [filters, setFilters] = useState<PeopleFilters>(DEFAULT_FILTERS)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [dismissId, setDismissId] = useState<string | null>(null)

  const people = useMemo(() => (config ? filterPeople(config, filters) : []), [config, filters])
  if (!config) return null

  const editing =
    editor?.mode === 'edit' ? (config.employees.find((e) => e.id === editor.id) ?? null) : null
  const dismissing = dismissId ? (config.employees.find((e) => e.id === dismissId) ?? null) : null

  return (
    <div className="space-y-6" data-admin-people>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {fmt(p.count, { n: people.length })}
        </p>
        <Button type="button" onClick={() => setEditor({ mode: 'hire' })}>
          <UserPlus aria-hidden />
          {p.hire}
        </Button>
      </div>

      <PeopleFiltersBar config={config} value={filters} onChange={setFilters} />

      <PeopleList
        people={people}
        config={config}
        onEdit={(e: Employee) => setEditor({ mode: 'edit', id: e.id })}
        onDismiss={(e: Employee) => setDismissId(e.id)}
      />

      <ArchiveList config={config} />

      {editor?.mode === 'hire' && <PersonEditor key="hire" person={null} onClose={() => setEditor(null)} />}
      {editing && <PersonEditor key={editing.id} person={editing} onClose={() => setEditor(null)} />}
      {dismissing && <DismissDialog person={dismissing} onClose={() => setDismissId(null)} />}
    </div>
  )
}

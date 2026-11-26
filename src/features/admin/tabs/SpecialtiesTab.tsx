import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useConfig, useLabel } from '@/office/hooks'
import { ConfirmChangeDialog } from '../people/ConfirmChangeDialog'
import { SpecialtyEditor } from '../specialties/SpecialtyEditor'
import { specialtyDeleteBlock, specialtyUsage } from '../specialties/specialtyModel'

type Editor = { mode: 'add' } | { mode: 'edit'; key: string }

/** Quản trị → Chuyên môn (P10-T08, R4): rename and re-home freely, delete only when unused. */
export function SpecialtiesTab() {
  const { t } = useI18n()
  const s = t.adminPeople.specialties
  const label = useLabel()
  const { config } = useConfig()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deleteKey, setDeleteKey] = useState<string | null>(null)

  const sorted = useMemo(() => {
    if (!config) return []
    const order = new Map(config.departments.map((d) => [d.key, d.order]))
    return [...config.specialties].sort(
      (a, b) =>
        (order.get(a.homeDepartmentKey ?? '') ?? 999) - (order.get(b.homeDepartmentKey ?? '') ?? 999) ||
        a.label.vi.localeCompare(b.label.vi, 'vi'),
    )
  }, [config])
  if (!config) return null

  const editing = editor?.mode === 'edit' ? (config.specialties.find((x) => x.key === editor.key) ?? null) : null
  const deleting = deleteKey ? (config.specialties.find((x) => x.key === deleteKey) ?? null) : null
  const deptByKey = new Map(config.departments.map((d) => [d.key, d]))

  return (
    <div className="space-y-4" data-admin-specialties>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">{s.description}</p>
        <Button type="button" onClick={() => setEditor({ mode: 'add' })}>
          <Plus aria-hidden />
          {s.add}
        </Button>
      </div>

      <ul className="grid gap-3 lg:grid-cols-2" aria-label={s.listAriaLabel}>
        {sorted.map((sp) => {
          const name = label(sp.label)
          const usage = specialtyUsage(config, sp.key)
          const block = specialtyDeleteBlock(config, sp)
          const home = sp.homeDepartmentKey ? deptByKey.get(sp.homeDepartmentKey) : undefined
          const reasonId = `specialty-${sp.key}-delete-reason`
          return (
            <li
              key={sp.key}
              data-specialty-key={sp.key}
              className="space-y-2 rounded-xl border border-border bg-surface p-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm font-semibold">{name}</h3>
                  <p className="text-xs text-muted-foreground">
                    <code>{sp.key}</code> · {home ? label(home.label) : s.noHome} ·{' '}
                    {block ? fmt(s.inUse, { people: usage.people, types: usage.taskTypes }) : s.unused}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`${t.admin.edit}: ${name}`}
                    onClick={() => setEditor({ mode: 'edit', key: sp.key })}
                  >
                    <Pencil aria-hidden />
                    {t.admin.edit}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-blocked hover:bg-blocked-soft"
                    aria-label={fmt(s.delete.forSpecialty, { name })}
                    disabled={block !== null}
                    aria-describedby={block ? reasonId : undefined}
                    onClick={() => setDeleteKey(sp.key)}
                  >
                    <Trash2 aria-hidden />
                    {s.delete.action}
                  </Button>
                </div>
              </div>
              {block && (
                <p id={reasonId} className="text-xs text-muted-foreground">
                  {fmt(s.delete.blocked, { people: block.people, types: block.taskTypes })}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {editor?.mode === 'add' && <SpecialtyEditor key="add" specialty={null} onClose={() => setEditor(null)} />}
      {editing && <SpecialtyEditor key={editing.key} specialty={editing} onClose={() => setEditor(null)} />}
      {deleting && (
        <ConfirmChangeDialog
          title={fmt(s.delete.title, { name: label(deleting.label) })}
          description={s.delete.description}
          confirmLabel={s.delete.confirm}
          cancelLabel={t.admin.save.cancel}
          successMessage={fmt(s.removed, { name: label(deleting.label) })}
          change={{ kind: 'specialty.delete', key: deleting.key }}
          onClose={() => setDeleteKey(null)}
        />
      )}
    </div>
  )
}

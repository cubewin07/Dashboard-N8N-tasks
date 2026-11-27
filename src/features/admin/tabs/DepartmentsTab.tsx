// P10-T06 · Phòng ban (R2): ordered list, reorder buttons, add/edit sheet, deactivate.
import { Pencil, Plus } from 'lucide-react'
import { useMemo, useState, type CSSProperties } from 'react'
import { EmptyState } from '@/components'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Department } from '@/domain/config'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useConfig, useLabel } from '@/office/hooks'
import { DEPARTMENT_ICONS } from '../departments/icons'
import { DepartmentEditor } from '../departments/DepartmentEditor'
import { activeStaffCount, reorderChange, sortedDepartments } from '../departments/model'
import { ReorderButtons } from '../shared/fields'
import { SaveStatusText } from '../shared/EditorSheet'
import { useConfigEdit } from '../shared/useConfigEdit'

type Editing = { department: Department | null } | null

export function DepartmentsTab() {
  const { t } = useI18n()
  const a = t.adminOrg.departments
  const label = useLabel()
  const { config } = useConfig()
  const { status, save } = useConfigEdit()
  const [editing, setEditing] = useState<Editing>(null)

  const departments = useMemo(() => (config ? sortedDepartments(config) : []), [config])
  if (!config) return null

  const move = (index: number, delta: -1 | 1) => {
    const change = reorderChange(departments, index, delta)
    if (change) void save(change)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">{a.intro}</p>
        <div className="flex items-center gap-3">
          <SaveStatusText status={status} />
          <Button type="button" onClick={() => setEditing({ department: null })}>
            <Plus className="size-4" aria-hidden />
            {a.add}
          </Button>
        </div>
      </div>

      {departments.length === 0 ? (
        <EmptyState title={t.admin.tabs.departments} description={t.admin.empty} />
      ) : (
        <ul aria-label={a.listLabel} className="space-y-2">
          {departments.map((d, i) => {
            const swatch = config.palette.find((s) => s.key === d.colorSwatch)
            const Icon = DEPARTMENT_ICONS[d.icon]
            const staff = activeStaffCount(config, d.id)
            const name = label(d.label)
            return (
              <li
                key={d.id}
                data-department-key={d.key}
                data-department-active={d.active}
                style={
                  {
                    '--dept': swatch?.hex ?? 'var(--primary)',
                    '--dept-soft': swatch?.softHex ?? 'var(--primary-soft)',
                  } as CSSProperties
                }
                className="flex flex-wrap items-center gap-3 rounded-[14px] border border-border bg-surface p-3 sm:p-4"
              >
                <span
                  aria-hidden
                  style={{ backgroundColor: 'var(--dept-soft)', color: 'var(--dept)' }}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
                >
                  {Icon ? <Icon className="size-5" /> : null}
                </span>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-base font-semibold">{name}</span>
                    {!d.active && <Badge variant="neutral">{t.admin.inactive}</Badge>}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>{fmt(a.staffCount, { n: staff })}</span>
                    <span>{a.hours[d.hours]}</span>
                    <span className="tabular">{fmt(a.orderNumber, { n: i + 1 })}</span>
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <ReorderButtons
                    name={name}
                    disabled={status === 'saving'}
                    onUp={i > 0 ? () => move(i, -1) : null}
                    onDown={i < departments.length - 1 ? () => move(i, 1) : null}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`${t.admin.edit}: ${name}`}
                    onClick={() => setEditing({ department: d })}
                  >
                    <Pencil className="size-4" aria-hidden />
                    {t.admin.edit}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <DepartmentEditor
          config={config}
          department={editing.department}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

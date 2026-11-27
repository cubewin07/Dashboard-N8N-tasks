import type { Employee, OrgConfig } from '@/domain/config'
import type { Label } from '@/domain/primitives'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useLabel } from '@/office/hooks'
import { PersonActions } from './PersonActions'
import { useIsPhone } from './useIsPhone'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return Array.from(parts[0]!).slice(0, 2).join('').toUpperCase()
  return `${Array.from(parts[0]!)[0] ?? ''}${Array.from(parts[parts.length - 1]!)[0] ?? ''}`.toUpperCase()
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-xs font-bold text-primary"
    >
      {initials(name)}
    </span>
  )
}

interface Row {
  employee: Employee
  department: string
  role: string
  specialties: string[]
}

function buildRows(
  people: readonly Employee[],
  config: OrgConfig,
  label: (l: Label) => string,
  buildingLabel: string,
): Row[] {
  const depts = new Map(config.departments.map((d) => [d.id, d]))
  const roles = new Map(config.roles.map((r) => [r.key, r]))
  const specs = new Map(config.specialties.map((s) => [s.key, s]))
  return people.map((e) => {
    const dept = e.departmentId ? depts.get(e.departmentId) : undefined
    const role = roles.get(e.roleKey)
    return {
      employee: e,
      department: dept ? label(dept.label) : buildingLabel,
      role: role ? label(role.label) : e.roleKey,
      specialties: e.specialties.map((k) => {
        const s = specs.get(k)
        return s ? label(s.label) : k
      }),
    }
  })
}

/** Table on desktop, cards under 640 px (R5). */
export function PeopleList({
  people,
  config,
  onEdit,
  onDismiss,
}: {
  people: readonly Employee[]
  config: OrgConfig
  onEdit: (e: Employee) => void
  onDismiss: (e: Employee) => void
}) {
  const { t } = useI18n()
  const p = t.adminPeople.people
  const label = useLabel()
  const phone = useIsPhone()
  const rows = buildRows(people, config, label, p.filters.building)

  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{p.noMatch}</p>
  }

  if (phone) {
    return (
      <ul className="space-y-2" aria-label={p.listAriaLabel} data-people-cards>
        {rows.map((r) => (
          <li
            key={r.employee.id}
            data-employee-id={r.employee.id}
            className={cn(
              'space-y-2 rounded-xl border border-border bg-surface p-3',
              r.employee.state === 'archived' && 'opacity-80',
            )}
          >
            <div className="flex items-center gap-3">
              <Avatar name={r.employee.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.employee.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.role} · {r.department}
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {p.kind[r.employee.kind]}
              </span>
            </div>
            {r.specialties.length > 0 && (
              <p className="text-xs text-muted-foreground">{r.specialties.join(' · ')}</p>
            )}
            <p className="text-xs text-muted-foreground">{p.state[r.employee.state]}</p>
            <PersonActions person={r.employee} onEdit={onEdit} onDismiss={onDismiss} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[56rem] text-left text-sm" data-people-table>
        <caption className="sr-only">{p.listAriaLabel}</caption>
        <thead className="border-b border-border bg-surface-muted text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">{p.columns.person}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{p.columns.department}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{p.columns.role}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{p.columns.specialties}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{p.columns.kind}</th>
            <th scope="col" className="px-3 py-2 font-semibold">{p.columns.state}</th>
            <th scope="col" className="px-3 py-2 font-semibold">
              <span className="sr-only">{p.columns.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr
              key={r.employee.id}
              data-employee-id={r.employee.id}
              className={cn(r.employee.state === 'archived' && 'text-muted-foreground')}
            >
              <th scope="row" className="px-3 py-2 font-normal">
                <span className="flex items-center gap-2.5">
                  <Avatar name={r.employee.name} />
                  <span className="font-semibold text-foreground">{r.employee.name}</span>
                </span>
              </th>
              <td className="px-3 py-2">{r.department}</td>
              <td className="px-3 py-2">{r.role}</td>
              <td className="px-3 py-2">{r.specialties.join(', ') || '–'}</td>
              <td className="px-3 py-2">{p.kind[r.employee.kind]}</td>
              <td className="px-3 py-2">{p.state[r.employee.state]}</td>
              <td className="px-3 py-2">
                <PersonActions person={r.employee} onEdit={onEdit} onDismiss={onDismiss} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

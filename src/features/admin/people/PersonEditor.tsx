import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label as FieldLabel } from '@/components/ui/label'
import type { ConfigChange, Employee } from '@/domain/config'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useConfig, useLabel } from '@/office/hooks'
import { EditorSheet } from '../shared/EditorSheet'
import { Field } from '../shared/fields'
import { useConfigEdit } from '../shared/useConfigEdit'
import { NativeSelect } from './NativeSelect'
import {
  blankDraft,
  draftFromEmployee,
  employeeFromDraft,
  groupSpecialties,
  newEmployeeId,
  sameDraft,
  type PersonDraft,
} from './peopleModel'
import { useChangeIssues } from './useChangeIssues'

/**
 * Hire (person = null) or edit one person. Saves one `employee.upsert`; appearance is never touched
 * (looks are keyed by employee id, so a rename or move keeps the look).
 */
export function PersonEditor({
  person,
  onClose,
}: {
  person: Employee | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const p = t.adminPeople.people
  const label = useLabel()
  const { config } = useConfig()
  const baseId = useId()
  const { status, save } = useConfigEdit()

  const [initial] = useState<PersonDraft>(() =>
    person ? draftFromEmployee(person) : config ? blankDraft(config) : ({} as PersonDraft),
  )
  const [draft, setDraft] = useState<PersonDraft>(initial)
  const [now] = useState(() => new Date().toISOString())

  const set = <K extends keyof PersonDraft>(key: K, value: PersonDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const role = config?.roles.find((r) => r.key === draft.roleKey)
  const buildingRole = role?.scope === 'building'

  const change = useMemo<ConfigChange | null>(() => {
    if (!config || draft.name.trim() === '') return null
    const id =
      person?.id ?? newEmployeeId(draft.name, config.employees.map((e) => e.id))
    return {
      kind: 'employee.upsert',
      employee: employeeFromDraft(draft, config.roles, { base: person, id, now }),
    }
  }, [config, draft, person, now])

  const { issues, blocking } = useChangeIssues(change)

  if (!config) return null

  const departments = [...config.departments]
    .filter((d) => d.active || d.id === draft.departmentId)
    .sort((a, b) => a.order - b.order)
  const roles = [...config.roles].sort((a, b) => a.sortOrder - b.sortOrder)
  const department = config.departments.find((d) => d.id === draft.departmentId)
  const { home, other } = groupSpecialties(config.specialties, buildingRole ? undefined : department)
  const dirty = !sameDraft(draft, initial)
  const canSave = change !== null && dirty && !blocking

  const onSave = async () => {
    if (!change || change.kind !== 'employee.upsert') return
    if (await save(change)) {
      if (!person) toast.success(fmt(p.hired, { name: change.employee.name }))
      onClose()
    }
  }

  const toggleSpecialty = (key: string, on: boolean) =>
    set(
      'specialties',
      on ? [...draft.specialties, key] : draft.specialties.filter((s) => s !== key),
    )

  const specialtyGroup = (title: string | null, list: typeof home) =>
    list.length === 0 ? null : (
      <div className="space-y-1.5">
        {title && <p className="text-xs font-semibold text-muted-foreground">{title}</p>}
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {list.map((s) => {
            const id = `${baseId}-spec-${s.key}`
            return (
              <li key={s.key} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={draft.specialties.includes(s.key)}
                  onCheckedChange={(v) => toggleSpecialty(s.key, v === true)}
                />
                <FieldLabel htmlFor={id} className="cursor-pointer font-normal">
                  {label(s.label)}
                </FieldLabel>
              </li>
            )
          })}
        </ul>
      </div>
    )

  return (
    <EditorSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={person ? p.editTitle : p.hireTitle}
      description={person ? p.editDescription : p.hireDescription}
      issues={issues}
      status={status}
      canSave={canSave}
      onSave={() => void onSave()}
    >
      <Field label={p.fields.name} htmlFor={`${baseId}-name`}>
        <Input
          id={`${baseId}-name`}
          value={draft.name}
          required
          autoComplete="off"
          aria-invalid={draft.name.trim() === '' ? true : undefined}
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={p.fields.role} htmlFor={`${baseId}-role`}>
          <NativeSelect
            id={`${baseId}-role`}
            value={draft.roleKey}
            onChange={(e) => set('roleKey', e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {label(r.label)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label={p.fields.department}
          htmlFor={`${baseId}-dept`}
          hint={buildingRole ? p.fields.departmentBuilding : undefined}
        >
          <NativeSelect
            id={`${baseId}-dept`}
            value={buildingRole ? '' : (draft.departmentId ?? '')}
            disabled={buildingRole}
            onChange={(e) => set('departmentId', e.target.value || null)}
          >
            {(buildingRole || !draft.departmentId) && <option value="">{p.noDepartment}</option>}
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {label(d.label)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field label={p.fields.kind} htmlFor={`${baseId}-kind`} hint={p.fields.kindHint}>
        <NativeSelect
          id={`${baseId}-kind`}
          value={draft.kind}
          onChange={(e) => set('kind', e.target.value as Employee['kind'])}
        >
          <option value="core">{p.kind.core}</option>
          <option value="temp">{p.kind.temp}</option>
        </NativeSelect>
      </Field>

      <fieldset className="space-y-3">
        <legend className="mb-1.5 text-sm font-medium">{p.fields.specialties}</legend>
        {home.length + other.length === 0 && (
          <p className="text-sm text-muted-foreground">{p.fields.specialtiesNone}</p>
        )}
        {specialtyGroup(home.length > 0 ? p.fields.specialtiesHome : null, home)}
        {specialtyGroup(home.length > 0 ? p.fields.specialtiesOther : null, other)}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={p.fields.reviewMode} htmlFor={`${baseId}-review`}>
          <NativeSelect
            id={`${baseId}-review`}
            value={draft.reviewMode}
            onChange={(e) => set('reviewMode', e.target.value as Employee['reviewMode'])}
          >
            <option value="always">{p.reviewMode.always}</option>
            <option value="when_important">{p.reviewMode.when_important}</option>
          </NativeSelect>
        </Field>
        <Field label={p.fields.modelTier} htmlFor={`${baseId}-tier`}>
          <NativeSelect
            id={`${baseId}-tier`}
            value={draft.modelTierOverride ?? ''}
            onChange={(e) =>
              set('modelTierOverride', (e.target.value || null) as PersonDraft['modelTierOverride'])
            }
          >
            <option value="">
              {fmt(p.fields.modelTierDefault, { tier: role ? p.modelTier[role.modelTier] : '' })}
            </option>
            <option value="strong">{p.modelTier.strong}</option>
            <option value="standard">{p.modelTier.standard}</option>
            <option value="cheap">{p.modelTier.cheap}</option>
          </NativeSelect>
        </Field>
      </div>
    </EditorSheet>
  )
}

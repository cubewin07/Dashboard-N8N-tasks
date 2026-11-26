import { useId } from 'react'
import type { OrgConfig } from '@/domain/config'
import { useI18n } from '@/i18n'
import { useLabel } from '@/office/hooks'
import { Field } from '../shared/fields'
import { NativeSelect } from './NativeSelect'
import { BUILDING_FILTER, type KindFilter, type PeopleFilters, type StateFilter } from './peopleModel'

export function PeopleFiltersBar({
  config,
  value,
  onChange,
}: {
  config: OrgConfig
  value: PeopleFilters
  onChange: (next: PeopleFilters) => void
}) {
  const { t } = useI18n()
  const f = t.adminPeople.people.filters
  const p = t.adminPeople.people
  const label = useLabel()
  const id = useId()
  const set = <K extends keyof PeopleFilters>(key: K, v: PeopleFilters[K]) =>
    onChange({ ...value, [key]: v })

  return (
    <div
      role="group"
      aria-label={f.title}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      data-people-filters
    >
      <Field label={f.department} htmlFor={`${id}-dept`}>
        <NativeSelect
          id={`${id}-dept`}
          value={value.departmentId}
          onChange={(e) => set('departmentId', e.target.value)}
        >
          <option value="all">{f.allDepartments}</option>
          <option value={BUILDING_FILTER}>{f.building}</option>
          {[...config.departments]
            .sort((a, b) => a.order - b.order)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {label(d.label)}
              </option>
            ))}
        </NativeSelect>
      </Field>
      <Field label={f.role} htmlFor={`${id}-role`}>
        <NativeSelect
          id={`${id}-role`}
          value={value.roleKey}
          onChange={(e) => set('roleKey', e.target.value)}
        >
          <option value="all">{f.allRoles}</option>
          {[...config.roles]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((r) => (
              <option key={r.key} value={r.key}>
                {label(r.label)}
              </option>
            ))}
        </NativeSelect>
      </Field>
      <Field label={f.kind} htmlFor={`${id}-kind`}>
        <NativeSelect
          id={`${id}-kind`}
          value={value.kind}
          onChange={(e) => set('kind', e.target.value as KindFilter)}
        >
          <option value="all">{f.allKinds}</option>
          <option value="core">{p.kind.core}</option>
          <option value="temp">{p.kind.temp}</option>
        </NativeSelect>
      </Field>
      <Field label={f.state} htmlFor={`${id}-state`}>
        <NativeSelect
          id={`${id}-state`}
          value={value.state}
          onChange={(e) => set('state', e.target.value as StateFilter)}
        >
          <option value="all">{f.allStates}</option>
          <option value="active">{p.state.active}</option>
          <option value="archived">{p.state.archived}</option>
        </NativeSelect>
      </Field>
    </div>
  )
}

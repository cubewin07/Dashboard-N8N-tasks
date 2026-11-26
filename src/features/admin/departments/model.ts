// Pure helpers for the Departments tab (R2): list order, deactivation refusal, the change to save.
import type { ConfigChange, Department, OrgConfig, PaletteSwatch } from '@/domain/config'
import type { DepartmentId, Label } from '@/domain/primitives'
import { moveId } from '../shared/fields'
import { KEY_PATTERN, slugKey, uniqueKey } from '../shared/keys'

export type DepartmentHours = Department['hours']

export interface DepartmentDraft {
  label: Label
  key: string
  /** The boss typed the key by hand: stop deriving it from the Vietnamese label. */
  keyTouched: boolean
  colorSwatch: string
  icon: string
  hours: DepartmentHours
  active: boolean
}

export type DepartmentError =
  | { code: 'labelRequired' }
  | { code: 'keyInvalid' }
  | { code: 'keyTaken' }
  | { code: 'hasStaff'; n: number }

/** Palette entries that make sense as a floor colour (not status, priority or fixed-floor colours). */
const NOT_FLOOR_COLOURS = new Set(['management', 'boss', 'leisure', 'paper', 'screen_off'])

export function floorSwatches(palette: readonly PaletteSwatch[]): PaletteSwatch[] {
  return palette.filter(
    (s) => !s.key.startsWith('status_') && !s.key.startsWith('priority_') && !NOT_FLOOR_COLOURS.has(s.key),
  )
}

/** Departments by `order` (then key). The Management and Boss floors are not departments (D8). */
export function sortedDepartments(config: OrgConfig): Department[] {
  return [...config.departments].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
}

export function activeStaffCount(config: OrgConfig, departmentId: DepartmentId): number {
  return config.employees.filter((e) => e.state === 'active' && e.departmentId === departmentId).length
}

/** Move one department up or down: the `department.reorder` change with the full id list. */
export function reorderChange(
  departments: readonly Department[],
  index: number,
  delta: -1 | 1,
): ConfigChange | null {
  const target = index + delta
  if (target < 0 || target >= departments.length) return null
  return { kind: 'department.reorder', ids: moveId(departments.map((d) => d.id), index, delta) }
}

export function emptyDraft(config: OrgConfig): DepartmentDraft {
  const first = floorSwatches(config.palette)[0]
  return {
    label: { vi: '', en: '' },
    key: '',
    keyTouched: false,
    colorSwatch: first?.key ?? 'cs',
    icon: 'Briefcase',
    hours: 'office',
    active: true,
  }
}

export function draftFrom(department: Department): DepartmentDraft {
  return {
    label: { ...department.label },
    key: department.key,
    keyTouched: true,
    colorSwatch: department.colorSwatch,
    icon: department.icon,
    hours: department.hours,
    active: department.active,
  }
}

/** The key follows the Vietnamese label until the boss edits it by hand (creating only). */
export function withLabel(draft: DepartmentDraft, label: Label, config: OrgConfig): DepartmentDraft {
  if (draft.keyTouched) return { ...draft, label }
  const base = label.vi.trim() ? slugKey(label.vi) : ''
  const key = base ? uniqueKey(base, takenKeys(config)) : ''
  return { ...draft, label, key }
}

function takenKeys(config: OrgConfig): string[] {
  return config.departments.flatMap((d) => [d.key, d.id.replace(/^dep_/, '')])
}

/** Everything wrong with the draft that the form can know itself (works before the validator does). */
export function draftErrors(
  draft: DepartmentDraft,
  existing: Department | null,
  config: OrgConfig,
): DepartmentError[] {
  const errors: DepartmentError[] = []
  if (!draft.label.vi.trim()) errors.push({ code: 'labelRequired' })
  if (!existing) {
    if (!KEY_PATTERN.test(draft.key)) errors.push({ code: 'keyInvalid' })
    else if (takenKeys(config).includes(draft.key)) errors.push({ code: 'keyTaken' })
  }
  if (existing && existing.active && !draft.active) {
    const n = activeStaffCount(config, existing.id)
    if (n > 0) errors.push({ code: 'hasStaff', n })
  }
  return errors
}

export function isDirty(draft: DepartmentDraft, existing: Department | null): boolean {
  if (!existing) return draft.label.vi.trim() !== '' || draft.key !== ''
  return (
    draft.label.vi !== existing.label.vi ||
    draft.label.en !== existing.label.en ||
    draft.colorSwatch !== existing.colorSwatch ||
    draft.icon !== existing.icon ||
    draft.hours !== existing.hours ||
    draft.active !== existing.active
  )
}

/** The `department.upsert` for the draft. A new department goes last (order = max + 1). */
export function buildDepartmentChange(
  draft: DepartmentDraft,
  existing: Department | null,
  config: OrgConfig,
): ConfigChange {
  const vi = draft.label.vi.trim()
  const label: Label = { vi, en: draft.label.en.trim() || vi }
  if (existing) {
    return {
      kind: 'department.upsert',
      department: {
        ...existing,
        label,
        colorSwatch: draft.colorSwatch,
        icon: draft.icon,
        hours: draft.hours,
        active: draft.active,
      },
    }
  }
  const order = config.departments.reduce((max, d) => Math.max(max, d.order), 0) + 1
  return {
    kind: 'department.upsert',
    department: {
      id: `dep_${draft.key}`,
      key: draft.key,
      label,
      order,
      colorSwatch: draft.colorSwatch,
      icon: draft.icon,
      hours: draft.hours,
      floorTemplate: 'department',
      active: draft.active,
    },
  }
}

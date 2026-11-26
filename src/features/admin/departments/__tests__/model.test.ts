import { describe, expect, it } from 'vitest'
import { seedConfig } from '@/office/configStore'
import { applyConfigChange } from '@/domain/configChange'
import {
  buildDepartmentChange,
  draftErrors,
  draftFrom,
  emptyDraft,
  floorSwatches,
  reorderChange,
  sortedDepartments,
  withLabel,
} from '../model'

const config = seedConfig()

describe('department list', () => {
  it('sorts by order and never lists the boss or management floor', () => {
    const list = sortedDepartments(config)
    expect(list.map((d) => d.key)).toEqual(['cs', 'marketing', 'design', 'accounting'])
    expect(list.some((d) => d.key === 'boss' || d.key === 'management')).toBe(false)
  })

  it('offers only floor-style colours', () => {
    const keys = floorSwatches(config.palette).map((s) => s.key)
    expect(keys).toContain('cs')
    expect(keys).not.toContain('boss')
    expect(keys).not.toContain('status_blocked')
    expect(keys).not.toContain('priority_urgent')
  })
})

describe('reorderChange', () => {
  const list = sortedDepartments(config)

  it('moving down swaps with the next and sends the full id list', () => {
    const change = reorderChange(list, 0, 1)
    expect(change).toEqual({
      kind: 'department.reorder',
      ids: ['dep_marketing', 'dep_cs', 'dep_design', 'dep_accounting'],
    })
    const next = applyConfigChange(config, change!)
    expect(sortedDepartments(next).map((d) => d.key)).toEqual(['marketing', 'cs', 'design', 'accounting'])
  })

  it('moving up from the second place', () => {
    const change = reorderChange(list, 1, -1)
    expect(change).toMatchObject({ ids: ['dep_marketing', 'dep_cs', 'dep_design', 'dep_accounting'] })
  })

  it('has nothing to do past either end', () => {
    expect(reorderChange(list, 0, -1)).toBeNull()
    expect(reorderChange(list, list.length - 1, 1)).toBeNull()
  })
})

describe('deactivation refusal', () => {
  const cs = config.departments.find((d) => d.key === 'cs')!

  it('refuses while the department has active staff', () => {
    const draft = { ...draftFrom(cs), active: false }
    const errors = draftErrors(draft, cs, config)
    const refusal = errors.find((e) => e.code === 'hasStaff')
    expect(refusal).toBeTruthy()
    expect(refusal && 'n' in refusal ? refusal.n : 0).toBeGreaterThan(0)
  })

  it('allows it once nobody active is left', () => {
    const emptied = {
      ...config,
      employees: config.employees.map((e) =>
        e.departmentId === cs.id ? { ...e, state: 'archived' as const } : e,
      ),
    }
    expect(draftErrors({ ...draftFrom(cs), active: false }, cs, emptied)).toEqual([])
  })

  it('does not refuse keeping the department active', () => {
    expect(draftErrors(draftFrom(cs), cs, config)).toEqual([])
  })
})

describe('creating a department', () => {
  it('derives the key from the Vietnamese label and keeps it unique', () => {
    const draft = withLabel(emptyDraft(config), { vi: 'Kho vận', en: '' }, config)
    expect(draft.key).toBe('kho_van')
    const clash = withLabel(emptyDraft(config), { vi: 'Marketing', en: '' }, config)
    expect(clash.key).toBe('marketing_2')
  })

  it('stops following the label once the key was typed', () => {
    const typed = { ...emptyDraft(config), key: 'kho', keyTouched: true }
    expect(withLabel(typed, { vi: 'Kho vận', en: '' }, config).key).toBe('kho')
  })

  it('builds an upsert with order = max + 1 and the department template', () => {
    const draft = withLabel(emptyDraft(config), { vi: 'Kho vận', en: '' }, config)
    expect(draftErrors(draft, null, config)).toEqual([])
    const change = buildDepartmentChange(draft, null, config)
    expect(change).toMatchObject({
      kind: 'department.upsert',
      department: {
        id: 'dep_kho_van',
        key: 'kho_van',
        label: { vi: 'Kho vận', en: 'Kho vận' },
        order: 5,
        floorTemplate: 'department',
        active: true,
      },
    })
  })

  it('rejects an empty label, a malformed key and a taken key', () => {
    const empty = emptyDraft(config)
    expect(draftErrors(empty, null, config).map((e) => e.code)).toContain('labelRequired')
    expect(draftErrors({ ...empty, label: { vi: 'A', en: '' }, key: 'Bad Key' }, null, config)).toContainEqual({
      code: 'keyInvalid',
    })
    expect(draftErrors({ ...empty, label: { vi: 'A', en: '' }, key: 'cs' }, null, config)).toContainEqual({
      code: 'keyTaken',
    })
  })

  it('keeps the key, id and order when editing', () => {
    const cs = config.departments.find((d) => d.key === 'cs')!
    const change = buildDepartmentChange({ ...draftFrom(cs), label: { vi: 'CSKH', en: '' } }, cs, config)
    expect(change).toMatchObject({
      department: { id: 'dep_cs', key: 'cs', order: cs.order, label: { vi: 'CSKH', en: 'CSKH' } },
    })
  })
})

import { describe, expect, it } from 'vitest'
import type { OrgConfig } from '@/domain/config'
import { seedConfig } from '@/office/configStore'
import {
  DEFAULT_FILTERS,
  blankDraft,
  draftFromEmployee,
  employeeFromDraft,
  filterPeople,
  groupSpecialties,
  newEmployeeId,
} from '../peopleModel'

const config: OrgConfig = seedConfig()

describe('filterPeople', () => {
  it('defaults to active people, floors first, building people before departments', () => {
    const list = filterPeople(config, DEFAULT_FILTERS)
    expect(list.length).toBe(config.employees.filter((e) => e.state === 'active').length)
    expect(list[0]!.departmentId).toBeNull()
  })

  it('filters by department, role, kind and state together', () => {
    const cs = config.departments.find((d) => d.key === 'cs')!
    const inCs = filterPeople(config, { ...DEFAULT_FILTERS, departmentId: cs.id })
    expect(inCs.length).toBeGreaterThan(0)
    expect(inCs.every((e) => e.departmentId === cs.id)).toBe(true)

    const workers = filterPeople(config, { ...DEFAULT_FILTERS, departmentId: cs.id, roleKey: 'worker' })
    expect(workers.every((e) => e.roleKey === 'worker' && e.departmentId === cs.id)).toBe(true)

    const building = filterPeople(config, { ...DEFAULT_FILTERS, departmentId: 'building' })
    expect(building.every((e) => e.departmentId === null)).toBe(true)

    const archived = { ...config.employees[5]!, state: 'archived' as const, kind: 'temp' as const }
    const cfg2 = { ...config, employees: config.employees.map((e) => (e.id === archived.id ? archived : e)) }
    expect(filterPeople(cfg2, { ...DEFAULT_FILTERS, state: 'archived' }).map((e) => e.id)).toEqual([archived.id])
    expect(filterPeople(cfg2, { ...DEFAULT_FILTERS, state: 'all', kind: 'temp' }).map((e) => e.id)).toEqual([archived.id])
    expect(filterPeople(cfg2, { ...DEFAULT_FILTERS, kind: 'temp' })).toEqual([])
  })
})

describe('newEmployeeId', () => {
  it('slugs the name with the emp_ prefix and stays unique', () => {
    expect(newEmployeeId('Nguyễn Văn Đạt', [])).toBe('emp_nguyen_van_dat')
    expect(newEmployeeId('Thu', ['emp_thu'])).toBe('emp_thu_2')
    expect(newEmployeeId('Thu', ['emp_thu', 'emp_thu_2'])).toBe('emp_thu_3')
  })
})

describe('employeeFromDraft', () => {
  it('hires an active person created by the boss', () => {
    const draft = { ...blankDraft(config), name: '  Tuấn Khải  ', kind: 'temp' as const }
    const emp = employeeFromDraft(draft, config.roles, {
      base: null,
      id: newEmployeeId(draft.name, config.employees.map((e) => e.id)),
      now: '2026-11-26T01:00:00Z',
    })
    expect(emp).toMatchObject({
      id: 'emp_tuan_khai',
      name: 'Tuấn Khải',
      kind: 'temp',
      state: 'active',
      createdBy: 'boss',
      createdAt: '2026-11-26T01:00:00Z',
      archivedAt: null,
      bio: null,
    })
    expect(emp.departmentId).not.toBeNull()
  })

  it('keeps everything the form does not edit when editing', () => {
    const base = { ...config.employees.find((e) => e.roleKey === 'worker')!, bio: { vi: 'a', en: 'b' } }
    const draft = { ...draftFromEmployee(base), name: 'Tên mới' }
    const emp = employeeFromDraft(draft, config.roles, { base, id: base.id, now: '2026-11-26T01:00:00Z' })
    expect(emp).toEqual({ ...base, name: 'Tên mới' })
  })

  it('drops the department for building-scope roles', () => {
    const draft = { ...blankDraft(config), name: 'Quản lý', roleKey: 'manager' }
    const emp = employeeFromDraft(draft, config.roles, { base: null, id: 'emp_ql', now: '2026-11-26T01:00:00Z' })
    expect(emp.departmentId).toBeNull()
  })
})

describe('groupSpecialties', () => {
  it('puts the department home specialties first', () => {
    const cs = config.departments.find((d) => d.key === 'cs')!
    const { home, other } = groupSpecialties(config.specialties, cs)
    expect(home.length).toBeGreaterThan(0)
    expect(home.every((s) => s.homeDepartmentKey === 'cs')).toBe(true)
    expect(other.some((s) => s.homeDepartmentKey === 'cs')).toBe(false)
    expect(home.length + other.length).toBe(config.specialties.length)
  })
})

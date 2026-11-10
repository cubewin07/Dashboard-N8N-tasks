import { describe, expect, it } from 'vitest'
import { makeConfig } from '../__fixtures__/builders'
import { orgTree, peopleByDepartment } from '../selectors'

describe('domain selectors', () => {
  it('groups peopleByDepartment sorted by role sortOrder then createdAt then id', () => {
    const cfg = makeConfig({
      employees: [
        ...makeConfig().employees,
        {
          id: 'emp_linh',
          name: 'Linh',
          departmentId: 'dep_cs',
          roleKey: 'lead',
          specialties: ['customer_chat'],
          kind: 'core',
          state: 'active',
          reviewMode: 'always',
          modelTierOverride: null,
          bio: null,
          createdAt: '2026-11-10T00:00:00Z',
          createdBy: 'seed',
          archivedAt: null,
        },
      ],
    })
    const grouped = peopleByDepartment(cfg)
    expect(grouped.dep_cs?.map((e) => e.id)).toEqual(['emp_ngoc', 'emp_linh', 'emp_mai'])
    expect(grouped.building?.map((e) => e.id)).toEqual(['emp_owner_1', 'emp_thu'])
  })

  it('builds orgTree top to bottom with boss floor first and management second', () => {
    const cfg = makeConfig({
      departments: [
        ...makeConfig().departments,
        {
          id: 'dep_mkt',
          key: 'marketing',
          label: { vi: 'Marketing', en: 'Marketing' },
          order: 2,
          colorSwatch: 'marketing',
          icon: 'Megaphone',
          hours: 'office',
          floorTemplate: 'department',
          active: true,
        },
        {
          id: 'dep_inactive',
          key: 'inactive_dept',
          label: { vi: 'Ngừng', en: 'Inactive' },
          order: 3,
          colorSwatch: 'cs',
          icon: 'Box',
          hours: 'office',
          floorTemplate: 'department',
          active: false,
        },
      ],
    })
    const tree = orgTree(cfg)
    expect(tree.map((f) => f.floorKey)).toEqual(['boss', 'management', 'marketing', 'cs'])
    expect(tree[0]?.kind).toBe('boss')
    expect(tree[0]?.people.map((p) => p.employee.id)).toEqual(['emp_owner_1'])
    expect(tree[1]?.kind).toBe('management')
    expect(tree[1]?.people.map((p) => p.employee.id)).toEqual(['emp_thu'])
    expect(tree[2]?.department?.key).toBe('marketing')
    expect(tree[2]?.people).toEqual([])
    expect(tree[3]?.department?.key).toBe('cs')
    expect(tree[3]?.people.map((p) => p.employee.id)).toEqual(['emp_ngoc', 'emp_mai'])
  })
})

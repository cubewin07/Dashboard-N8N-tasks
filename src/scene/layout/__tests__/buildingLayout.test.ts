import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { BuildingStackEntry, Department } from '@/domain/config'
import type { DepartmentId } from '@/domain/primitives'
import { computeBuildingLayout } from '../buildingLayout'
import { buildTemplateMap, getFloorTemplate } from '../templates'

describe('computeBuildingLayout (R1, R2, R3)', () => {
  it('R1: produces deterministic output for identical OrgConfig', () => {
    const config = makeSeedConfig()
    const layout1 = computeBuildingLayout(config)
    const layout2 = computeBuildingLayout(config)
    expect(layout1).toEqual(layout2)
  })

  it('R2: expands the seed config into 8 floors in stack order with boss on top', () => {
    const config = makeSeedConfig()
    const layout = computeBuildingLayout(config)

    expect(layout.floors.map((f) => f.key)).toEqual([
      'lobby_cafe',
      'cs',
      'marketing',
      'design',
      'accounting',
      'games_rest',
      'management',
      'boss',
    ])
    expect(layout.floors.map((f) => f.y)).toEqual([0, 4, 8, 12, 16, 20, 24, 28])
    expect(layout.totalHeight).toBe(32)
    expect(layout.bounds).toEqual({
      min: [0, 0, 0],
      max: [24, 32, 14],
    })
    expect(layout.floors.at(-1)?.kind).toBe('boss')
    expect(layout.elevatorCarCount).toBe(2)
  })

  it('R2: adding an active department produces 9 floors and keeps boss on top', () => {
    const base = makeSeedConfig()
    const newDept: Department = {
      id: 'dep_logistics',
      key: 'logistics',
      label: { vi: 'Vận hành kho', en: 'Logistics' },
      order: 5,
      colorSwatch: 'cs',
      icon: 'Truck',
      hours: 'office',
      floorTemplate: 'department',
      active: true,
    }
    const layout = computeBuildingLayout({
      ...base,
      departments: [...base.departments, newDept],
    })

    expect(layout.floors).toHaveLength(9)
    expect(layout.floors.map((f) => f.key)).toEqual([
      'lobby_cafe',
      'cs',
      'marketing',
      'design',
      'accounting',
      'logistics',
      'games_rest',
      'management',
      'boss',
    ])
    expect(layout.floors.at(-1)?.kind).toBe('boss')
  })

  it('R2: inactive departments produce no floor, and boss/duplicate fixed entries in stack are deduped', () => {
    const base = makeSeedConfig()
    const customStack = [
      { kind: 'fixed', key: 'boss', template: 'boss' } as unknown as BuildingStackEntry,
      ...base.building.stack,
      { kind: 'fixed', key: 'management', template: 'management' } as BuildingStackEntry,
    ]
    const layout = computeBuildingLayout({
      ...base,
      departments: base.departments.map((d) =>
        d.key === 'design' ? { ...d, active: false } : d,
      ),
      building: {
        ...base.building,
        stack: customStack,
      },
    })

    expect(layout.floors.map((f) => f.key)).toEqual([
      'lobby_cafe',
      'cs',
      'marketing',
      'accounting',
      'games_rest',
      'management',
      'boss',
    ])
    expect(layout.floors.filter((f) => f.kind === 'boss')).toHaveLength(1)
    expect(layout.floors.at(-1)?.kind).toBe('boss')
  })

  it('R3: scales cleanly to 40 active departments (44 floors) with no overlap and boss on top', () => {
    const base = makeSeedConfig()
    const fortyDepts: Department[] = Array.from({ length: 40 }, (_, i) => ({
      id: `dep_d${i + 1}` as DepartmentId,
      key: `dept_${i + 1}`,
      label: { vi: `Phòng ${i + 1}`, en: `Dept ${i + 1}` },
      order: i + 1,
      colorSwatch: 'cs',
      icon: 'Building2',
      hours: 'office',
      floorTemplate: 'department',
      active: true,
    }))

    const layout = computeBuildingLayout({
      ...base,
      departments: fortyDepts,
      employees: base.employees.filter((e) => e.departmentId === null),
    })

    expect(layout.floors).toHaveLength(44)
    expect(layout.totalHeight).toBe(44 * 4)
    expect(layout.floors[0]?.key).toBe('lobby_cafe')
    expect(layout.floors[43]?.kind).toBe('boss')

    const seenKeys = new Set<string>()
    layout.floors.forEach((f, idx) => {
      expect(f.index).toBe(idx)
      expect(f.y).toBe(idx * 4)
      expect(seenKeys.has(f.key)).toBe(false)
      seenKeys.add(f.key)
    })
  })

  it('throws a clear error when requesting an unknown floor template', () => {
    const map = buildTemplateMap([])
    expect(() => getFloorTemplate(map, 'non_existent_tpl')).toThrow(
      /Unknown floor template "non_existent_tpl"/,
    )
  })
})

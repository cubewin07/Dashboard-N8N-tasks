import { describe, expect, it } from 'vitest'
import approvalRules from '@/content/approval-rules.json'
import building from '@/content/building.json'
import orgSeed from '@/content/org.seed.json'
import palette from '@/content/palette.json'
import platforms from '@/content/platforms.json'
import policy from '@/content/policy.json'
import roles from '@/content/roles.json'
import specialties from '@/content/specialties.json'
import taskTypes from '@/content/task-types.json'
import { makeConfig } from '../__fixtures__/builders'
import { parseOrgConfig } from '../config'

describe('parseOrgConfig', () => {
  it('parses the full bundled src/content/*.json seed (28 core staff, 4 departments)', () => {
    const seedCfg = parseOrgConfig({
      departments: orgSeed.departments,
      employees: orgSeed.employees,
      shops: orgSeed.shops,
      roles,
      specialties,
      platforms,
      approvalRules,
      policy,
      taskTypes,
      building,
      floorTemplates: [],
      palette,
    })
    expect(seedCfg.departments).toHaveLength(4)
    expect(seedCfg.employees).toHaveLength(28)
    expect(seedCfg.roles).toHaveLength(6)
    expect(seedCfg.specialties).toHaveLength(15)
    expect(seedCfg.platforms).toHaveLength(9)
    expect(seedCfg.shops).toHaveLength(5)
    expect(seedCfg.approvalRules).toHaveLength(5)

    // 1 manager, 2 owners, and 1 dept_manager + 1 lead per department
    expect(seedCfg.employees.filter((e) => e.roleKey === 'manager')).toHaveLength(1)
    expect(seedCfg.employees.filter((e) => e.roleKey === 'owner')).toHaveLength(2)
    for (const dept of seedCfg.departments) {
      const inDept = seedCfg.employees.filter((e) => e.departmentId === dept.id)
      expect(inDept.filter((e) => e.roleKey === 'dept_manager')).toHaveLength(1)
      expect(inDept.filter((e) => e.roleKey === 'lead')).toHaveLength(1)
    }
  })

  it('parses a valid config', () => {
    const cfg = makeConfig()
    expect(parseOrgConfig(cfg)).toEqual(cfg)
  })

  it('rejects unknown roleKey, departmentId, specialty, and maxPerDepartment violations', () => {
    const base = makeConfig()

    // Unknown roleKey
    expect(() =>
      parseOrgConfig({
        ...base,
        employees: [{ ...base.employees[3], roleKey: 'non_existent_role' }],
      }),
    ).toThrow(/Unknown roleKey "non_existent_role"/)

    // Unknown departmentId
    expect(() =>
      parseOrgConfig({
        ...base,
        employees: [{ ...base.employees[3], departmentId: 'dep_unknown' }],
      }),
    ).toThrow(/Unknown departmentId "dep_unknown"/)

    // Department role with null departmentId
    expect(() =>
      parseOrgConfig({
        ...base,
        employees: [{ ...base.employees[3], departmentId: null }],
      }),
    ).toThrow(/requires a departmentId/)

    // Building role with departmentId
    expect(() =>
      parseOrgConfig({
        ...base,
        employees: [{ ...base.employees[1], departmentId: 'dep_cs' }],
      }),
    ).toThrow(/must have departmentId = null/)

    // Unknown specialty on employee
    expect(() =>
      parseOrgConfig({
        ...base,
        employees: [{ ...base.employees[3], specialties: ['unknown_spec'] }],
      }),
    ).toThrow(/Unknown specialty "unknown_spec"/)

    // Exceeds maxPerDepartment (dept_manager is max 1)
    expect(() =>
      parseOrgConfig({
        ...base,
        employees: [
          ...base.employees,
          {
            ...base.employees[2],
            id: 'emp_ngoc_2',
            name: 'Ngọc 2',
          },
        ],
      }),
    ).toThrow(/exceeds maxPerDepartment/)
  })

  it('rejects broken cross-references in specialties, shops, taskTypes, rules, templates, and palette', () => {
    const base = makeConfig()

    expect(() =>
      parseOrgConfig({
        ...base,
        specialties: [
          ...base.specialties,
          {
            key: 'orphan_spec',
            label: { vi: 'Orphan', en: 'Orphan' },
            icon: 'Tag',
            homeDepartmentKey: 'missing_dept',
          },
        ],
      }),
    ).toThrow(/Unknown homeDepartmentKey "missing_dept"/)

    expect(() =>
      parseOrgConfig({
        ...base,
        shops: [
          {
            id: 'shop_bad',
            platformKey: 'missing_platform',
            name: 'Bad Shop',
            handle: null,
          },
        ],
      }),
    ).toThrow(/Unknown platformKey "missing_platform"/)

    expect(() =>
      parseOrgConfig({
        ...base,
        taskTypes: [
          {
            key: 'cs.bad_task',
            departmentKey: 'missing_dept',
            label: { vi: 'Bad', en: 'Bad' },
            specialty: 'missing_spec',
            tags: ['routine_draft'],
            defaultPriority: 'normal',
            durationMinutes: [5, 10],
            platformKeys: ['missing_plat'],
            needsHelpFrom: ['missing_help'],
            carries: 'document',
          },
        ],
      }),
    ).toThrow(/Unknown departmentKey/)

    expect(() =>
      parseOrgConfig({
        ...base,
        approvalRules: [
          {
            id: 'bad_rule',
            order: 1,
            enabled: true,
            label: { vi: 'Bad', en: 'Bad' },
            when: {
              platformsAny: ['missing_plat'],
              departmentsAny: ['missing_dept'],
            },
            level: 'boss',
          },
        ],
      }),
    ).toThrow(/Unknown platformKey/)

    expect(() =>
      parseOrgConfig({
        ...base,
        floorTemplates: [
          {
            key: 'lobby_cafe',
            size: { w: 24, d: 14 },
            gridCell: 0.5,
            fixedSlots: [],
            walls: [],
          },
        ],
      }),
    ).toThrow(/Unknown floorTemplate "department"/)

    expect(() =>
      parseOrgConfig({
        ...base,
        departments: [{ ...base.departments[0], colorSwatch: 'unknown_swatch' }],
      }),
    ).toThrow(/Unknown colorSwatch "unknown_swatch"/)
  })
})

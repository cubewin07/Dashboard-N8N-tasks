import { describe, expect, it } from 'vitest'
import { makeConfig } from '../__fixtures__/builders'
import { parseOrgConfig } from '../config'

describe('parseOrgConfig', () => {
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

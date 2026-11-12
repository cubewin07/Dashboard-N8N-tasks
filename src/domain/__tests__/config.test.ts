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
import { DEFAULT_FLOOR_TEMPLATES, makeConfig } from '../__fixtures__/builders'
import { parseOrgConfig } from '../config'

describe('parseOrgConfig', () => {
  it('parses the full bundled src/content/*.json seed (28 core staff, 4 departments, 5 floor templates)', () => {
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
      floorTemplates: DEFAULT_FLOOR_TEMPLATES,
      palette,
    })
    expect(seedCfg.departments).toHaveLength(4)
    expect(seedCfg.employees).toHaveLength(28)
    expect(seedCfg.roles).toHaveLength(6)
    expect(seedCfg.specialties).toHaveLength(15)
    expect(seedCfg.platforms).toHaveLength(9)
    expect(seedCfg.shops).toHaveLength(5)
    expect(seedCfg.approvalRules).toHaveLength(5)
    expect(seedCfg.floorTemplates).toHaveLength(5)

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
        floorTemplates: base.floorTemplates.filter((t) => t.key !== 'department'),
      }),
    ).toThrow(/Unknown floorTemplate "department"/)

    expect(() =>
      parseOrgConfig({
        ...base,
        departments: [{ ...base.departments[0], colorSwatch: 'unknown_swatch' }],
      }),
    ).toThrow(/Unknown colorSwatch "unknown_swatch"/)
  })

  it('enforces floorTemplate bounds, 0.4m slot spacing, 2-cell doors, and R5 vertical core alignment', () => {
    const base = makeConfig()

    // R5: moving stairs_entry in one template fails validation
    expect(() =>
      parseOrgConfig({
        ...base,
        floorTemplates: base.floorTemplates.map((tpl) =>
          tpl.key === 'boss'
            ? {
                ...tpl,
                fixedSlots: tpl.fixedSlots.map((s) =>
                  s.type === 'stairs_entry' ? { ...s, x: s.x + 0.5 } : s,
                ),
              }
            : tpl,
        ),
      }),
    ).toThrow(/stairs_entry \(x, z\) coordinates .* do not match/)

    // R5: moving elevator_door in one template fails validation
    expect(() =>
      parseOrgConfig({
        ...base,
        floorTemplates: base.floorTemplates.map((tpl) =>
          tpl.key === 'lobby_cafe'
            ? {
                ...tpl,
                fixedSlots: tpl.fixedSlots.map((s) =>
                  s.id === 'elevator_door_1' ? { ...s, z: s.z + 0.5 } : s,
                ),
              }
            : tpl,
        ),
      }),
    ).toThrow(/elevator_door \(x, z\) coordinates .* do not match/)

    // Out-of-bounds slot
    expect(() =>
      parseOrgConfig({
        ...base,
        floorTemplates: base.floorTemplates.map((tpl) =>
          tpl.key === 'department'
            ? {
                ...tpl,
                fixedSlots: [
                  ...tpl.fixedSlots,
                  {
                    id: 'out_of_bounds',
                    type: 'decor',
                    x: 25,
                    z: 5,
                    rotY: 0,
                    footprint: [[50, 10]],
                    approach: [49, 10],
                  },
                ],
              }
            : tpl,
        ),
      }),
    ).toThrow(/outside template "department" bounds/)

    // Two slots within < 0.4m
    expect(() =>
      parseOrgConfig({
        ...base,
        floorTemplates: base.floorTemplates.map((tpl) =>
          tpl.key === 'department'
            ? {
                ...tpl,
                fixedSlots: [
                  ...tpl.fixedSlots,
                  {
                    id: 'too_close',
                    type: 'decor',
                    x: tpl.fixedSlots[0]!.x + 0.2,
                    z: tpl.fixedSlots[0]!.z,
                    rotY: 0,
                    footprint: [[41, 18]],
                    approach: [40, 18],
                  },
                ],
              }
            : tpl,
        ),
      }),
    ).toThrow(/is within 0.4m/)

    // Door narrower than 2 grid cells (1.0m)
    expect(() =>
      parseOrgConfig({
        ...base,
        floorTemplates: base.floorTemplates.map((tpl) =>
          tpl.key === 'department'
            ? {
                ...tpl,
                walls: [
                  ...tpl.walls,
                  { x1: 2, z1: 0, x2: 2, z2: 4, door: { offset: 1, width: 0.5 } },
                ],
              }
            : tpl,
        ),
      }),
    ).toThrow(/must be at least 2 grid cells/)
  })
})

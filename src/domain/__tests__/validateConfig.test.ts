import { describe, expect, it } from 'vitest'
import { fmt } from '@/lib/utils'
import { adminIssues as en } from '@/i18n/en/adminIssues'
import { adminIssues as vi } from '@/i18n/vi/adminIssues'
import { makeSeedConfig } from '../__fixtures__/builders'
import type { Employee, OrgConfig, Platform } from '../config'
import {
  hasErrors,
  validateConfig,
  type ConfigIssue,
  type ConfigIssueCode,
} from '../validateConfig'

function seed(): OrgConfig {
  return JSON.parse(JSON.stringify(makeSeedConfig())) as OrgConfig
}

function codes(issues: ConfigIssue[], level?: ConfigIssue['level']): ConfigIssueCode[] {
  return issues.filter((i) => !level || i.level === level).map((i) => i.code)
}

function errorCodes(cfg: unknown): ConfigIssueCode[] {
  return codes(validateConfig(cfg), 'error')
}

function employee(cfg: OrgConfig, id: string): Employee {
  return cfg.employees.find((e) => e.id === id)!
}

function newEmployee(cfg: OrgConfig, patch: Partial<Employee>): Employee {
  const base = cfg.employees.find((e) => e.roleKey === 'worker')!
  return { ...base, id: 'emp_extra', name: 'Người mới', ...patch }
}

describe('validateConfig: seed', () => {
  it('has no errors and no warnings', () => {
    expect(validateConfig(makeSeedConfig())).toEqual([])
  })

  it('also passes when given plain JSON (the import path)', () => {
    expect(validateConfig(seed())).toEqual([])
  })

  it('hasErrors tells errors from warnings', () => {
    const warn: ConfigIssue = {
      level: 'warning',
      code: 'deptNoLead',
      path: [],
      params: {},
    }
    const err: ConfigIssue = {
      level: 'error',
      code: 'managerMissing',
      path: [],
      params: {},
    }
    expect(hasErrors([])).toBe(false)
    expect(hasErrors([warn])).toBe(false)
    expect(hasErrors([warn, err])).toBe(true)
  })
})

describe('validateConfig: shape (zod)', () => {
  it('reports structural problems as schema errors and stops there', () => {
    const cfg = seed() as unknown as Record<string, unknown>
    cfg.policy = 'nope'
    const issues = validateConfig(cfg)
    expect(codes(issues)).toContain('schema')
    expect(issues.every((i) => i.code === 'schema')).toBe(true)
    expect(issues[0]!.params.message).toBeTruthy()
  })

  it('rejects garbage input', () => {
    expect(errorCodes(null)).toContain('schema')
    expect(errorCodes(42)).toContain('schema')
  })

  it('maps a bad key and still runs the invariants', () => {
    const cfg = seed()
    cfg.departments[0]!.key = 'Bad Key'
    cfg.employees = cfg.employees.filter((e) => e.roleKey !== 'manager')
    const issues = validateConfig(cfg)
    const bad = issues.find((i) => i.code === 'badKey')!
    expect(bad.params.value).toBe('Bad Key')
    expect(bad.path).toEqual(['departments', 0, 'key'])
    expect(codes(issues, 'error')).toContain('managerMissing')
  })

  it('maps a malformed id', () => {
    const cfg = seed()
    cfg.employees[0]!.id = 'nhan_vien_1' as Employee['id']
    const bad = validateConfig(cfg).find((i) => i.code === 'badId')!
    expect(bad.params.value).toBe('nhan_vien_1')
    expect(bad.params.prefix).toBe('emp')
  })

  it('treats a missing id as structural', () => {
    const cfg = seed() as unknown as { employees: Record<string, unknown>[] }
    delete cfg.employees[0]!.id
    expect(codes(validateConfig(cfg))).toContain('schema')
  })

  it('maps scope/department mismatches', () => {
    const cfg = seed()
    const dm = cfg.employees.find((e) => e.roleKey === 'dept_manager')!
    dm.departmentId = null
    const mgr = cfg.employees.find((e) => e.roleKey === 'manager')!
    mgr.departmentId = cfg.departments[0]!.id
    const issues = validateConfig(cfg)
    expect(codes(issues, 'error')).toEqual(
      expect.arrayContaining(['deptRequired', 'deptForbidden']),
    )
    expect(issues.find((i) => i.code === 'deptRequired')!.params.role).toBe('Trưởng phòng')
  })

  it('maps other custom issues (floor templates) to schema without stopping the invariants', () => {
    const cfg = seed()
    cfg.departments[0]!.floorTemplate = 'khong_co'
    cfg.employees = cfg.employees.filter((e) => e.roleKey !== 'manager')
    const found = errorCodes(cfg)
    expect(found).toContain('schema')
    expect(found).toContain('managerMissing')
  })
})

describe('invariant 1: exactly one active Manager', () => {
  it('fails with none', () => {
    const cfg = seed()
    cfg.employees = cfg.employees.filter((e) => e.roleKey !== 'manager')
    expect(errorCodes(cfg)).toContain('managerMissing')
  })

  it('fails when the only Manager is archived', () => {
    const cfg = seed()
    employee(cfg, 'emp_thu').state = 'archived'
    expect(errorCodes(cfg)).toContain('managerMissing')
  })

  it('fails with two, naming them', () => {
    const cfg = seed()
    cfg.employees.push(newEmployee(cfg, { roleKey: 'manager', departmentId: null, name: 'Hai' }))
    const issue = validateConfig(cfg).find((i) => i.code === 'managerMultiple')!
    expect(issue.level).toBe('error')
    expect(issue.params.count).toBe(2)
    expect(String(issue.params.names)).toContain('Hai')
  })

  it('passes with one active (an archived second one does not count; the human owner is not a Manager)', () => {
    const cfg = seed()
    cfg.employees.push(
      newEmployee(cfg, {
        roleKey: 'manager',
        departmentId: null,
        state: 'archived',
        archivedAt: '2026-11-10T00:00:00Z',
      }),
    )
    expect(errorCodes(cfg)).toEqual([])
  })
})

describe('invariant 2: at least one active human owner', () => {
  it('fails with none active', () => {
    const cfg = seed()
    for (const e of cfg.employees) {
      if (e.roleKey === 'owner') e.state = 'archived'
    }
    expect(errorCodes(cfg)).toContain('humanOwnerMissing')
  })

  it('passes with one left', () => {
    const cfg = seed()
    employee(cfg, 'emp_giam_doc').state = 'archived'
    expect(errorCodes(cfg)).not.toContain('humanOwnerMissing')
  })
})

describe('invariant 3: staffing per department', () => {
  it('fails when a role exceeds maxPerDepartment (names department, role and max)', () => {
    const cfg = seed()
    const dept = cfg.departments[0]!
    cfg.employees.push(newEmployee(cfg, { roleKey: 'dept_manager', departmentId: dept.id }))
    const issue = validateConfig(cfg).find((i) => i.code === 'roleOverLimit')!
    expect(issue.level).toBe('error')
    expect(issue.params).toMatchObject({
      department: dept.label.vi,
      role: 'Trưởng phòng',
      count: 2,
      max: 1,
    })
    expect(issue.path.slice(0, 1)).toEqual(['employees'])
    // zod's own copy of the check is not reported twice
    expect(codes(validateConfig(cfg)).filter((c) => c === 'roleOverLimit')).toHaveLength(1)
  })

  it('does not count archived staff or staff of inactive departments', () => {
    const cfg = seed()
    const dept = cfg.departments[0]!
    cfg.employees.push(
      newEmployee(cfg, {
        roleKey: 'dept_manager',
        departmentId: dept.id,
        state: 'archived',
      }),
    )
    expect(errorCodes(cfg)).toEqual([])
    const other = cfg.departments[1]!
    other.active = false
    cfg.employees.push(
      newEmployee(cfg, {
        id: 'emp_x2',
        roleKey: 'dept_manager',
        departmentId: other.id,
      }),
    )
    expect(errorCodes(cfg)).not.toContain('roleOverLimit')
  })

  it('treats a null maxPerDepartment as unlimited', () => {
    const cfg = seed()
    const dept = cfg.departments[0]!
    for (let i = 0; i < 5; i += 1) {
      cfg.employees.push(
        newEmployee(cfg, {
          id: `emp_w${i}` as Employee['id'],
          departmentId: dept.id,
        }),
      )
    }
    expect(errorCodes(cfg)).toEqual([])
  })

  it('warns (not errors) about a department without manager, lead or reviewer', () => {
    const cfg = seed()
    const dept = cfg.departments[0]!
    cfg.employees = cfg.employees.filter(
      (e) => e.departmentId !== dept.id || e.roleKey === 'worker',
    )
    const issues = validateConfig(cfg).filter((i) => i.params.department === dept.label.vi)
    expect(codes(issues)).toEqual(
      expect.arrayContaining(['deptNoManager', 'deptNoLead', 'deptNoReviewer']),
    )
    expect(issues.every((i) => i.level === 'warning')).toBe(true)
    expect(hasErrors(validateConfig(cfg))).toBe(false)
  })

  it('does not warn about an inactive department', () => {
    const cfg = seed()
    const dept = cfg.departments[0]!
    dept.active = false
    cfg.employees = cfg.employees.filter((e) => e.departmentId !== dept.id)
    cfg.taskTypes = cfg.taskTypes.filter((tt) => tt.departmentKey !== dept.key)
    cfg.approvalRules = cfg.approvalRules.filter((r) => !r.when.departmentsAny?.includes(dept.key))
    expect(validateConfig(cfg)).toEqual([])
  })
})

describe('invariant 4: unique ids/keys, key pattern', () => {
  it('fails on a duplicate department key', () => {
    const cfg = seed()
    cfg.departments[1]!.key = cfg.departments[0]!.key
    const issue = validateConfig(cfg).find((i) => i.code === 'duplicate')!
    expect(issue.level).toBe('error')
    expect(issue.params.value).toBe(cfg.departments[0]!.key)
    expect(issue.path).toEqual(['departments', 1, 'key'])
  })

  it.each<[string, (c: OrgConfig) => void]>([
    ['employees', (c: OrgConfig) => (c.employees[1]!.id = c.employees[0]!.id)],
    ['roles', (c: OrgConfig) => (c.roles[1]!.key = c.roles[0]!.key)],
    ['platforms', (c: OrgConfig) => (c.platforms[1]!.key = c.platforms[0]!.key)],
    ['approvalRules', (c: OrgConfig) => (c.approvalRules[1]!.id = c.approvalRules[0]!.id)],
    ['taskTypes', (c: OrgConfig) => (c.taskTypes[1]!.key = c.taskTypes[0]!.key)],
    ['specialties', (c: OrgConfig) => (c.specialties[1]!.key = c.specialties[0]!.key)],
    ['shops', (c: OrgConfig) => (c.shops[1]!.id = c.shops[0]!.id)],
  ])('fails on a duplicate in %s', (collection, mutate) => {
    const cfg = seed()
    mutate(cfg)
    const issue = validateConfig(cfg).find((i) => i.code === 'duplicate')
    expect(issue?.path[0]).toBe(collection)
  })

  it('fails on a key that is not snake_case', () => {
    for (const key of ['Kho Van', '1kho', 'kho-van', 'KHO']) {
      const cfg = seed()
      cfg.platforms[0]!.key = key
      expect(errorCodes(cfg)).toContain('badKey')
    }
  })

  it('passes on well-formed new keys', () => {
    const cfg = seed()
    cfg.specialties.push({
      key: 'kho_van_2',
      label: { vi: 'Kho vận', en: 'Logistics' },
      icon: 'Box',
      homeDepartmentKey: null,
    })
    expect(errorCodes(cfg)).toEqual([])
  })
})

describe('invariant 5: references resolve', () => {
  it('fails on an employee with unknown department / role / specialty', () => {
    const cfg = seed()
    const e = employee(cfg, 'emp_mai')
    e.departmentId = 'dep_ma'
    e.roleKey = 'ma_vai'
    e.specialties = ['ma_chuyen_mon']
    const issues = validateConfig(cfg)
    expect(codes(issues, 'error')).toEqual(
      expect.arrayContaining(['refDepartment', 'refRole', 'refSpecialty']),
    )
    expect(issues.find((i) => i.code === 'refRole')!.params).toMatchObject({
      value: 'ma_vai',
      owner: e.name,
    })
  })

  it('fails on a rule with unknown task type / platform / department', () => {
    const cfg = seed()
    cfg.approvalRules[0]!.when = {
      taskTypes: ['khong.co'],
      platformsAny: ['khong_co'],
      departmentsAny: ['khong_co'],
    }
    expect(errorCodes(cfg)).toEqual(
      expect.arrayContaining(['refTaskType', 'refPlatform', 'refDepartment']),
    )
  })

  it('fails on a shop with an unknown platform', () => {
    const cfg = seed()
    cfg.shops[0]!.platformKey = 'khong_co'
    expect(errorCodes(cfg)).toContain('refPlatform')
  })

  it('fails on a task type with an unknown department / specialty', () => {
    const cfg = seed()
    cfg.taskTypes[0]!.departmentKey = 'khong_co'
    cfg.taskTypes[0]!.specialty = 'khong_co'
    expect(errorCodes(cfg)).toEqual(expect.arrayContaining(['refDepartment', 'refSpecialty']))
  })

  it('does not validate free-text tags', () => {
    const cfg = seed()
    cfg.approvalRules[0]!.when = { tagsAny: ['mot_the_tu_do'] }
    expect(errorCodes(cfg)).toEqual([])
  })

  it('accepts a rule that refers to a department by id or key', () => {
    const cfg = seed()
    cfg.approvalRules[0]!.when = {
      departmentsAny: [cfg.departments[0]!.id, cfg.departments[1]!.key],
    }
    expect(validateConfig(cfg)).toEqual([])
  })

  it('warns (not errors) about references to inactive platforms and departments', () => {
    const cfg = seed()
    const platform: Platform = cfg.platforms[0]!
    platform.active = false
    const dept = cfg.departments[0]!
    cfg.approvalRules[0]!.when = {
      platformsAny: [platform.key],
      departmentsAny: [dept.key],
    }
    cfg.shops[0]!.platformKey = platform.key
    cfg.taskTypes[0]!.platformKeys = [platform.key]
    cfg.taskTypes[0]!.departmentKey = dept.key
    dept.active = false
    // The department's own staff are an error (R2); references to it are only warnings.
    const issues = validateConfig(cfg).filter((i) => i.code !== 'employeeInInactiveDepartment')
    expect(hasErrors(issues)).toBe(false)
    const warnings = codes(issues, 'warning')
    expect(warnings).toEqual(
      expect.arrayContaining(['refInactivePlatform', 'refInactiveDepartment']),
    )
    // each reference source is reported
    const platformPaths = issues
      .filter((i) => i.code === 'refInactivePlatform')
      .map((i) => i.path[0])
    expect(platformPaths).toEqual(expect.arrayContaining(['shops', 'taskTypes', 'approvalRules']))
  })

  it('refuses an inactive department that still has active staff (R2)', () => {
    const cfg = seed()
    const dept = cfg.departments[0]!
    dept.active = false
    const issues = validateConfig(cfg)
    expect(hasErrors(issues)).toBe(true)
    expect(issues.find((i) => i.code === 'employeeInInactiveDepartment')?.level).toBe('error')
  })
})

describe('invariant 6: approval levels can be reached', () => {
  function withoutApprover(cfg: OrgConfig, level: 'reviewer' | 'dept_manager'): void {
    for (const r of cfg.roles) {
      if (r.caps.approveLevel === level) r.caps.approveLevel = null
    }
  }

  it('fails when the default level has no approver role', () => {
    const cfg = seed()
    withoutApprover(cfg, 'dept_manager')
    const issue = validateConfig(cfg).find((i) => i.code === 'approverMissingDeptManager')!
    expect(issue.level).toBe('error')
    expect(issue.path).toEqual(['policy', 'approvals', 'defaultLevel'])
  })

  it('fails when an enabled rule needs a level nobody holds, and points at the rule', () => {
    const cfg = seed()
    withoutApprover(cfg, 'reviewer')
    const issue = validateConfig(cfg).find((i) => i.code === 'approverMissingReviewer')!
    const idx = cfg.approvalRules.findIndex((r) => r.level === 'reviewer')
    expect(issue.path).toEqual(['approvalRules', idx, 'level'])
  })

  it('ignores disabled rules', () => {
    const cfg = seed()
    withoutApprover(cfg, 'reviewer')
    for (const r of cfg.approvalRules) if (r.level === 'reviewer') r.enabled = false
    expect(errorCodes(cfg)).toEqual([])
  })

  it('needs an active human owner for the boss level', () => {
    const cfg = seed()
    for (const r of cfg.roles) {
      if (r.caps.approveLevel === 'boss') r.caps.approveLevel = null
    }
    for (const e of cfg.employees) if (e.roleKey === 'owner') e.state = 'archived'
    expect(errorCodes(cfg)).toContain('approverMissingBoss')
  })

  it('reaches the boss level through an active human owner even without an approveLevel', () => {
    const cfg = seed()
    for (const r of cfg.roles) {
      if (r.caps.approveLevel === 'boss') r.caps.approveLevel = null
    }
    expect(errorCodes(cfg)).toEqual([])
  })

  it('passes when every used level has an approver (custom role with approveLevel)', () => {
    const cfg = seed()
    withoutApprover(cfg, 'reviewer')
    const custom = {
      ...cfg.roles.find((r) => r.key === 'worker')!,
      key: 'kiem_tra',
      caps: {
        ...cfg.roles.find((r) => r.key === 'worker')!.caps,
        approveLevel: 'reviewer' as const,
      },
    }
    cfg.roles.push(custom)
    expect(errorCodes(cfg)).toEqual([])
  })
})

describe('invariant 7: policy ranges', () => {
  it.each<[string, (c: OrgConfig) => void, ConfigIssueCode | null]>([
    ['tempCap high', (c: OrgConfig) => (c.policy.staffing.tempCap = 51), 'policyTempCap'],
    ['tempCap ok low', (c: OrgConfig) => (c.policy.staffing.tempCap = 0), null],
    ['tempCap ok high', (c: OrgConfig) => (c.policy.staffing.tempCap = 50), null],
    ['maxRounds high', (c: OrgConfig) => (c.policy.help.maxRounds = 6), 'policyHelpRounds'],
    ['maxRounds ok', (c: OrgConfig) => (c.policy.help.maxRounds = 5), null],
    ['timeout low', (c: OrgConfig) => (c.policy.help.timeoutMinutes = 4), 'policyHelpTimeout'],
    ['timeout high', (c: OrgConfig) => (c.policy.help.timeoutMinutes = 481), 'policyHelpTimeout'],
    ['timeout ok', (c: OrgConfig) => (c.policy.help.timeoutMinutes = 480), null],
    [
      'seat high',
      (c: OrgConfig) => (c.policy.approvals.questionSeatThreshold = 11),
      'policyQuestionSeat',
    ],
    ['seat ok', (c: OrgConfig) => (c.policy.approvals.questionSeatThreshold = 10), null],
  ])('%s', (_name, mutate, expected) => {
    const cfg = seed()
    mutate(cfg)
    const found = errorCodes(cfg)
    if (expected) expect(found).toContain(expected)
    else expect(found).toEqual([])
  })

  it('requires strictly ordered weights', () => {
    const cfg = seed()
    cfg.policy.priority.weights = {
      urgent: 400,
      high: 300,
      normal: 300,
      low: 100,
    }
    expect(errorCodes(cfg)).toContain('policyWeights')
    cfg.policy.priority.weights = {
      urgent: 100,
      high: 300,
      normal: 200,
      low: 100,
    }
    expect(errorCodes(cfg)).toContain('policyWeights')
    cfg.policy.priority.weights = { urgent: 40, high: 30, normal: 20, low: 10 }
    cfg.policy.priority.agingCapPoints = 5
    expect(errorCodes(cfg)).toEqual([])
  })

  it('keeps aging below the high-low gap so low never passes high (or urgent)', () => {
    const cfg = seed()
    const gap = cfg.policy.priority.weights.high - cfg.policy.priority.weights.low
    cfg.policy.priority.agingCapPoints = gap
    const issue = validateConfig(cfg).find((i) => i.code === 'policyAgingCap')!
    expect(issue.params.limit).toBe(gap)
    cfg.policy.priority.agingCapPoints = gap - 1
    expect(errorCodes(cfg)).toEqual([])
  })
})

describe('invariant 8: the boss floor is not in the stack', () => {
  it('fails when a stack entry uses the boss template', () => {
    const cfg = seed()
    cfg.building.stack.push({
      kind: 'fixed',
      key: 'management',
      template: 'boss',
    })
    const issue = validateConfig(cfg).find((i) => i.code === 'bossInStack')!
    expect(issue.level).toBe('error')
    expect(issue.path).toEqual(['building', 'stack', cfg.building.stack.length - 1])
  })

  it('fails when a stack entry has the key boss', () => {
    const cfg = seed() as unknown as { building: { stack: unknown[] } }
    cfg.building.stack.push({ kind: 'fixed', key: 'boss', template: 'boss' })
    expect(errorCodes(cfg)).toContain('bossInStack')
    expect(codes(validateConfig(cfg)).filter((c) => c === 'bossInStack')).toHaveLength(1)
  })

  it('passes with the seed stack', () => {
    expect(errorCodes(seed())).toEqual([])
  })
})

describe('messages', () => {
  const ALL: Record<ConfigIssueCode, true> = {
    schema: true,
    duplicate: true,
    badKey: true,
    badId: true,
    refDepartment: true,
    refRole: true,
    refSpecialty: true,
    refPlatform: true,
    refTaskType: true,
    deptRequired: true,
    deptForbidden: true,
    managerMissing: true,
    managerMultiple: true,
    humanOwnerMissing: true,
    roleOverLimit: true,
    deptNoManager: true,
    deptNoLead: true,
    deptNoReviewer: true,
    refInactiveDepartment: true,
    refInactivePlatform: true,
    employeeInInactiveDepartment: true,
    approverMissingReviewer: true,
    approverMissingDeptManager: true,
    approverMissingBoss: true,
    policyTempCap: true,
    policyHelpRounds: true,
    policyHelpTimeout: true,
    policyWeights: true,
    policyAgingCap: true,
    policyQuestionSeat: true,
    bossInStack: true,
    builtInRoleMissing: true,
    builtInRoleChanged: true,
  }

  it('every code has a Vietnamese and an English message, with the same placeholders', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const code of Object.keys(ALL) as ConfigIssueCode[]) {
      expect(vi.codes[code], `vi ${code}`).toBeTruthy()
      expect(en.codes[code], `en ${code}`).toBeTruthy()
      expect(placeholders(en.codes[code])).toEqual(placeholders(vi.codes[code]))
    }
    expect(Object.keys(vi.codes).sort()).toEqual(Object.keys(ALL).sort())
    expect(Object.keys(en.codes).sort()).toEqual(Object.keys(ALL).sort())
  })

  it('messages are filled from the params of real issues (no placeholder left over)', () => {
    const cfg = seed()
    cfg.employees.push(
      newEmployee(cfg, {
        roleKey: 'dept_manager',
        departmentId: cfg.departments[0]!.id,
      }),
    )
    cfg.policy.staffing.tempCap = 99
    cfg.platforms[0]!.key = 'Sai Ma'
    cfg.approvalRules[0]!.when = { platformsAny: ['khong_co'] }
    const issues = validateConfig(cfg)
    expect(issues.length).toBeGreaterThan(2)
    for (const i of issues) {
      expect(fmt(vi.codes[i.code], { message: '', ...i.params })).not.toMatch(/\{\w+\}/)
      expect(fmt(en.codes[i.code], { message: '', ...i.params })).not.toMatch(/\{\w+\}/)
    }
    const over = issues.find((i) => i.code === 'roleOverLimit')!
    expect(fmt(vi.codes.roleOverLimit, over.params)).toBe(
      `Phòng ${cfg.departments[0]!.label.vi} đang có 2 người giữ vai Trưởng phòng (tối đa 1).`,
    )
  })
})

describe('built-in roles (R3, review fix)', () => {
  it('the seed has every built-in role intact', () => {
    expect(codes(validateConfig(seed()))).not.toContain('builtInRoleMissing')
    expect(codes(validateConfig(seed()))).not.toContain('builtInRoleChanged')
  })

  it('a config without a built-in role is refused (e.g. an import)', () => {
    const cfg = seed()
    cfg.roles = cfg.roles.filter((r) => r.key !== 'lead')
    const found = validateConfig(cfg).find((i) => i.code === 'builtInRoleMissing')
    expect(found).toMatchObject({ level: 'error', params: { role: 'lead' } })
  })

  it('a built-in role whose scope or humanOwner changed is refused', () => {
    const cfg = seed()
    cfg.roles = cfg.roles.map((r) =>
      r.key === 'worker' ? { ...r, caps: { ...r.caps, humanOwner: true } } : r,
    )
    expect(codes(validateConfig(cfg), 'error')).toContain('builtInRoleChanged')
    const cfg2 = seed()
    cfg2.roles = cfg2.roles.map((r) =>
      r.key === 'reviewer' ? { ...r, scope: 'building' as const } : r,
    )
    expect(codes(validateConfig(cfg2), 'error')).toContain('builtInRoleChanged')
  })
})

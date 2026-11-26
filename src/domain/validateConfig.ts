// P10-T02 · validateConfig: zod shape first, then the invariants of phase-10 §3.3.
// Pure. Messages come from i18n (`t.adminIssues.codes[code]`); `params` fill the placeholders.
import { OrgConfigSchema, type ApprovalRule, type OrgConfig, type RoleDef } from './config'
import { BUILT_IN_ROLES, BUILT_IN_ROLE_KEYS } from './configChange'
import { LEVEL_RANK, type ApprovalLevel } from './primitives'

export type ConfigIssueCode =
  /** Anything zod reports that has no specific code; params.message holds the zod text. */
  | 'schema'
  // Shape / reference problems (zod's checks, mapped to readable codes)
  | 'duplicate'
  | 'badKey'
  | 'badId'
  | 'refDepartment'
  | 'refRole'
  | 'refSpecialty'
  | 'refPlatform'
  | 'refTaskType'
  | 'deptRequired'
  | 'deptForbidden'
  // Inv. 1-2: who runs the building
  | 'managerMissing'
  | 'managerMultiple'
  | 'humanOwnerMissing'
  // Inv. 3: staffing per department
  | 'roleOverLimit'
  | 'deptNoManager'
  | 'deptNoLead'
  | 'deptNoReviewer'
  // Inv. 5 (warnings): references to switched-off things
  | 'refInactiveDepartment'
  | 'refInactivePlatform'
  // R2 (error): a department with active staff cannot be switched off
  | 'employeeInInactiveDepartment'
  // Inv. 6: approval levels
  | 'approverMissingReviewer'
  | 'approverMissingDeptManager'
  | 'approverMissingBoss'
  // Inv. 7: policy ranges
  | 'policyTempCap'
  | 'policyHelpRounds'
  | 'policyHelpTimeout'
  | 'policyWeights'
  | 'policyAgingCap'
  | 'policyQuestionSeat'
  // Inv. 8
  | 'bossInStack'
  // R3: built-in roles stay, with their scope and human-owner flag
  | 'builtInRoleMissing'
  | 'builtInRoleChanged'

export interface ConfigIssue {
  level: 'error' | 'warning'
  code: ConfigIssueCode
  /** Where in the config, e.g. ['employees', 3, 'roleKey']. */
  path: (string | number)[]
  params: Record<string, string | number>
}

export function hasErrors(issues: readonly ConfigIssue[]): boolean {
  return issues.some((i) => i.level === 'error')
}

type Path = (string | number)[]
type Params = Record<string, string | number>

function issue(
  level: ConfigIssue['level'],
  code: ConfigIssueCode,
  path: Path,
  params: Params = {},
): ConfigIssue {
  return { level, code, path, params }
}

// ---------------------------------------------------------------------------------------------
// Part 1: zod shape. Its issues are mapped to codes so messages name the broken rule.
// ---------------------------------------------------------------------------------------------

function getAt(root: unknown, path: readonly (string | number)[]): unknown {
  let cur: unknown = root
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string | number, unknown>)[seg]
  }
  return cur
}

/** Human name of the item a zod issue points into (employee name, label, key or id). */
function ownerName(input: unknown, path: Path): string {
  const item = getAt(input, path.slice(0, 2))
  if (item === null || typeof item !== 'object') return ''
  const o = item as Record<string, unknown>
  if (typeof o.name === 'string') return o.name
  const label = o.label
  if (label !== null && typeof label === 'object') {
    const vi = (label as Record<string, unknown>).vi
    if (typeof vi === 'string' && vi) return vi
  }
  for (const k of ['key', 'id']) if (typeof o[k] === 'string') return o[k]
  return ''
}

const LEVEL_CODE: Record<ApprovalLevel, ConfigIssueCode> = {
  reviewer: 'approverMissingReviewer',
  dept_manager: 'approverMissingDeptManager',
  boss: 'approverMissingBoss',
}

const REF_CODE: Record<string, ConfigIssueCode> = {
  roleKey: 'refRole',
  departmentId: 'refDepartment',
  departmentKey: 'refDepartment',
  homeDepartmentKey: 'refDepartment',
  department: 'refDepartment',
  specialty: 'refSpecialty',
  platformKey: 'refPlatform',
  taskType: 'refTaskType',
}

type Mapped = { issue: ConfigIssue; structural: false } | 'ignore' | { structural: true }

function mapZodIssue(
  z: { code: string; message: string; path: PropertyKey[] },
  input: unknown,
): Mapped {
  const path = z.path.filter((p): p is string | number => typeof p !== 'symbol')
  const msg = z.message
  const err = (code: ConfigIssueCode, params: Params): Mapped => ({
    issue: issue('error', code, path, params),
    structural: false,
  })

  // zod's enum rejects key 'boss' in the stack; say it in plain words (invariant 8).
  if (path[0] === 'building' && path[1] === 'stack' && typeof path[2] === 'number') {
    const entry = getAt(input, path.slice(0, 3))
    if (
      entry !== null &&
      typeof entry === 'object' &&
      (entry as { key?: unknown }).key === 'boss'
    ) {
      return {
        issue: issue('error', 'bossInStack', path.slice(0, 3)),
        structural: false,
      }
    }
  }

  // Enforced by invariant 3 below, which counts only active people in active departments.
  if (/exceeds maxPerDepartment/.test(msg)) return 'ignore'

  const dup = /^Duplicate \w+ (?:id|key) "(.*)"$/.exec(msg)
  if (dup)
    return err('duplicate', {
      value: dup[1] ?? '',
      owner: ownerName(input, path),
    })

  if (msg === 'Expected lowercase snake_case slug' || msg === 'Expected task type key') {
    const value = getAt(input, path)
    if (typeof value !== 'string') return { structural: true }
    return err('badKey', { value, owner: ownerName(input, path) })
  }

  const idPrefix = /^Expected ID with prefix "(\w+)_"/.exec(msg)
  if (idPrefix) {
    const value = getAt(input, path)
    if (typeof value !== 'string') return { structural: true }
    return err('badId', {
      value,
      prefix: idPrefix[1] ?? '',
      owner: ownerName(input, path),
    })
  }

  const unknown = /^Unknown (\w+) "(.*?)"/.exec(msg)
  if (unknown) {
    const code = REF_CODE[unknown[1] ?? '']
    if (code)
      return err(code, {
        value: unknown[2] ?? '',
        owner: ownerName(input, path),
      })
  }

  const empIdx = path[0] === 'employees' ? path[1] : undefined
  if (empIdx !== undefined && /requires a departmentId|must have departmentId = null/.test(msg)) {
    const roleKey = getAt(input, ['employees', empIdx, 'roleKey'])
    const role = (getAt(input, ['roles']) as RoleDef[] | undefined)?.find((r) => r.key === roleKey)
    return err(/requires/.test(msg) ? 'deptRequired' : 'deptForbidden', {
      owner: ownerName(input, path),
      role: role?.label?.vi ?? String(roleKey ?? ''),
    })
  }

  // Remaining custom (superRefine) issues, e.g. floor templates: the data shape itself is fine.
  if (z.code === 'custom') return err('schema', { message: msg })
  return { structural: true }
}

// ---------------------------------------------------------------------------------------------
// Part 2: invariants (phase-10 §3.3). Run on a config whose shape is sound.
// ---------------------------------------------------------------------------------------------

const label = (l: { vi: string } | undefined, fallback: string) => l?.vi || fallback

function invariants(cfg: OrgConfig): ConfigIssue[] {
  const out: ConfigIssue[] = []
  const roleByKey = new Map(cfg.roles.map((r) => [r.key, r]))
  const deptById = new Map(cfg.departments.map((d) => [d.id as string, d]))
  const deptByKey = new Map(cfg.departments.map((d) => [d.key, d]))
  const platformByKey = new Map(cfg.platforms.map((p) => [p.key, p]))
  const deptLabel = (d: { label: { vi: string }; key: string }) => label(d.label, d.key)

  // Inv. 1: exactly one active Manager (building scope, assigns tasks; the human owner is not it).
  const managers = cfg.employees.flatMap((e, idx) => {
    const role = roleByKey.get(e.roleKey)
    const isManager =
      e.state === 'active' &&
      role?.scope === 'building' &&
      role.caps.assignTasks &&
      !role.caps.humanOwner
    return isManager ? [{ e, idx }] : []
  })
  if (managers.length === 0) {
    out.push(issue('error', 'managerMissing', ['employees']))
  } else if (managers.length > 1) {
    out.push(
      issue('error', 'managerMultiple', ['employees', managers[1]!.idx], {
        count: managers.length,
        names: managers.map((m) => m.e.name).join(', '),
      }),
    )
  }

  // Inv. 2: at least one active human owner.
  const hasOwner = cfg.employees.some(
    (e) => e.state === 'active' && roleByKey.get(e.roleKey)?.caps.humanOwner === true,
  )
  if (!hasOwner) out.push(issue('error', 'humanOwnerMissing', ['employees']))

  // Inv. 3: per active department, respect maxPerDepartment for each role (null = unlimited).
  const activeDeptIds = new Set(cfg.departments.filter((d) => d.active).map((d) => d.id as string))
  const slots = new Map<string, number[]>()
  cfg.employees.forEach((e, idx) => {
    if (e.state !== 'active' || e.departmentId === null || !activeDeptIds.has(e.departmentId))
      return
    const k = `${e.departmentId}::${e.roleKey}`
    slots.set(k, [...(slots.get(k) ?? []), idx])
  })
  for (const [k, idxs] of slots) {
    const [deptId = '', roleKey = ''] = k.split('::')
    const role = roleByKey.get(roleKey)
    const max = role?.maxPerDepartment
    if (!role || max === null || max === undefined || idxs.length <= max) continue
    const dept = deptById.get(deptId)
    out.push(
      issue('error', 'roleOverLimit', ['employees', idxs[max]!, 'roleKey'], {
        department: dept ? deptLabel(dept) : deptId,
        role: label(role.label, role.key),
        count: idxs.length,
        max,
      }),
    )
  }
  // ...and warn (never block) when an active department lacks a manager, lead or reviewer.
  cfg.departments.forEach((d, idx) => {
    if (!d.active) return
    const caps = cfg.employees
      .filter((e) => e.state === 'active' && e.departmentId === d.id)
      .flatMap((e) => {
        const r = roleByKey.get(e.roleKey)
        return r ? [r.caps] : []
      })
    const params = { department: deptLabel(d) }
    if (!caps.some((c) => c.approveLevel === 'dept_manager')) {
      out.push(issue('warning', 'deptNoManager', ['departments', idx], params))
    }
    if (!caps.some((c) => c.distributeReviews)) {
      out.push(issue('warning', 'deptNoLead', ['departments', idx], params))
    }
    if (!caps.some((c) => c.approveLevel === 'reviewer')) {
      out.push(issue('warning', 'deptNoReviewer', ['departments', idx], params))
    }
  })

  // Inv. 5 (the inactive half): a reference to something switched off still resolves, so warn.
  const deptRefInactive = (ref: string) => {
    const d = deptByKey.get(ref) ?? deptById.get(ref)
    return d && !d.active ? d : undefined
  }
  const platformInactive = (key: string) => {
    const p = platformByKey.get(key)
    return p && !p.active ? p : undefined
  }
  cfg.employees.forEach((e, idx) => {
    if (e.state !== 'active' || e.departmentId === null) return
    const d = deptById.get(e.departmentId)
    if (d && !d.active) {
      out.push(
        issue('error', 'employeeInInactiveDepartment', ['employees', idx, 'departmentId'], {
          employee: e.name,
          department: deptLabel(d),
        }),
      )
    }
  })
  cfg.shops.forEach((s, idx) => {
    const p = platformInactive(s.platformKey)
    if (p) {
      out.push(
        issue('warning', 'refInactivePlatform', ['shops', idx, 'platformKey'], {
          owner: s.name,
          name: label(p.label, p.key),
        }),
      )
    }
  })
  cfg.taskTypes.forEach((tt, idx) => {
    const d = deptRefInactive(tt.departmentKey)
    const owner = label(tt.label, tt.key)
    if (d) {
      out.push(
        issue('warning', 'refInactiveDepartment', ['taskTypes', idx, 'departmentKey'], {
          owner,
          name: deptLabel(d),
        }),
      )
    }
    tt.platformKeys.forEach((pk, pIdx) => {
      const p = platformInactive(pk)
      if (p) {
        out.push(
          issue('warning', 'refInactivePlatform', ['taskTypes', idx, 'platformKeys', pIdx], {
            owner,
            name: label(p.label, p.key),
          }),
        )
      }
    })
  })
  cfg.approvalRules.forEach((r, idx) => {
    const owner = label(r.label, r.id)
    r.when.departmentsAny?.forEach((ref, dIdx) => {
      const d = deptRefInactive(ref)
      if (d) {
        out.push(
          issue(
            'warning',
            'refInactiveDepartment',
            ['approvalRules', idx, 'when', 'departmentsAny', dIdx],
            {
              owner,
              name: deptLabel(d),
            },
          ),
        )
      }
    })
    r.when.platformsAny?.forEach((pk, pIdx) => {
      const p = platformInactive(pk)
      if (p) {
        out.push(
          issue(
            'warning',
            'refInactivePlatform',
            ['approvalRules', idx, 'when', 'platformsAny', pIdx],
            {
              owner,
              name: label(p.label, p.key),
            },
          ),
        )
      }
    })
  })

  // Inv. 6: every approval level that is used has someone who can approve it.
  const reachable = new Set<ApprovalLevel>()
  for (const r of cfg.roles) if (r.caps.approveLevel) reachable.add(r.caps.approveLevel)
  if (hasOwner) reachable.add('boss')
  const used = new Map<ApprovalLevel, Path>()
  const markUsed = (level: ApprovalLevel, path: Path) => {
    if (!used.has(level)) used.set(level, path)
  }
  markUsed(cfg.policy.approvals.defaultLevel, ['policy', 'approvals', 'defaultLevel'])
  cfg.approvalRules.forEach((r: ApprovalRule, idx) => {
    if (r.enabled) markUsed(r.level, ['approvalRules', idx, 'level'])
  })
  for (const [level, path] of [...used].sort((a, b) => LEVEL_RANK[a[0]] - LEVEL_RANK[b[0]])) {
    if (!reachable.has(level)) out.push(issue('error', LEVEL_CODE[level], path))
  }

  // Inv. 7: policy ranges.
  const p = cfg.policy
  const range = (value: number, min: number, max: number) => value < min || value > max
  if (range(p.staffing.tempCap, 0, 50)) {
    out.push(
      issue('error', 'policyTempCap', ['policy', 'staffing', 'tempCap'], {
        value: p.staffing.tempCap,
        min: 0,
        max: 50,
      }),
    )
  }
  if (range(p.help.maxRounds, 1, 5)) {
    out.push(
      issue('error', 'policyHelpRounds', ['policy', 'help', 'maxRounds'], {
        value: p.help.maxRounds,
        min: 1,
        max: 5,
      }),
    )
  }
  if (range(p.help.timeoutMinutes, 5, 480)) {
    out.push(
      issue('error', 'policyHelpTimeout', ['policy', 'help', 'timeoutMinutes'], {
        value: p.help.timeoutMinutes,
        min: 5,
        max: 480,
      }),
    )
  }
  const w = p.priority.weights
  if (!(w.urgent > w.high && w.high > w.normal && w.normal > w.low)) {
    out.push(
      issue('error', 'policyWeights', ['policy', 'priority', 'weights'], {
        ...w,
      }),
    )
  }
  // Aging may never lift a low item above a high one (data-model §2.7): cap < high - low.
  if (p.priority.agingCapPoints >= w.high - w.low) {
    out.push(
      issue('error', 'policyAgingCap', ['policy', 'priority', 'agingCapPoints'], {
        value: p.priority.agingCapPoints,
        limit: w.high - w.low,
      }),
    )
  }
  if (range(p.approvals.questionSeatThreshold, 1, 10)) {
    out.push(
      issue('error', 'policyQuestionSeat', ['policy', 'approvals', 'questionSeatThreshold'], {
        value: p.approvals.questionSeatThreshold,
        min: 1,
        max: 10,
      }),
    )
  }

  // R3: built-in roles can't be removed, nor their scope / human-owner flag changed (an import
  // could otherwise do what the role editor forbids).
  for (const key of BUILT_IN_ROLE_KEYS) {
    const role = roleByKey.get(key)
    const want = BUILT_IN_ROLES[key]
    if (!role) {
      out.push(issue('error', 'builtInRoleMissing', ['roles'], { role: key }))
    } else if (role.scope !== want.scope || role.caps.humanOwner !== want.humanOwner) {
      out.push(
        issue('error', 'builtInRoleChanged', ['roles', cfg.roles.indexOf(role)], {
          role: label(role.label, role.key),
        }),
      )
    }
  }

  // Inv. 8: the boss floor is appended by the layout and never part of the stack.
  cfg.building.stack.forEach((entry, idx) => {
    if (entry.kind === 'fixed' && ((entry.key as string) === 'boss' || entry.template === 'boss')) {
      out.push(issue('error', 'bossInStack', ['building', 'stack', idx]))
    }
  })

  return out
}

// ---------------------------------------------------------------------------------------------

/**
 * Every write path (forms, import, reset; Local and Supabase adapters) runs this on the whole
 * resulting config before saving (R10). Errors refuse the change; warnings are shown only.
 *
 * Shape first (zod). If zod reports only reference/duplicate/key problems the data is still
 * structurally sound, so the invariants run as well and the boss sees everything at once. Any
 * structural zod error stops after the shape errors (the invariants could not trust the data).
 * Invariant 4's "keys never change once created" needs two configs: it is enforced by
 * `applyConfigChange` / the editors, not here.
 */
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function validateConfig(config: OrgConfig | unknown): ConfigIssue[] {
  const parsed = OrgConfigSchema.safeParse(config)
  if (parsed.success) return invariants(parsed.data)

  const shape: ConfigIssue[] = []
  let structural = false
  for (const z of parsed.error.issues) {
    const mapped = mapZodIssue(z, config)
    if (mapped === 'ignore') continue
    if (mapped.structural) {
      structural = true
      shape.push(
        issue(
          'error',
          'schema',
          z.path.filter((p): p is string | number => typeof p !== 'symbol'),
          { message: z.message },
        ),
      )
    } else if (
      !shape.some((x) => x.code === mapped.issue.code && sameJson(x.path, mapped.issue.path))
    ) {
      shape.push(mapped.issue)
    }
  }
  if (structural) return shape
  const seen = new Set(shape.map((x) => `${x.code}|${JSON.stringify(x.path)}`))
  const extra = invariants(config as OrgConfig).filter(
    (x) => !seen.has(`${x.code}|${JSON.stringify(x.path)}`),
  )
  return [...shape, ...extra]
}

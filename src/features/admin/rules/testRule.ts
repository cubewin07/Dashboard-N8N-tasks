// P10-T11 · Rule tester model: a sample task in, the engine's answer plus who would approve out.
// The decision itself is `explainLevel` (domain/rules.ts), the same code path the engine uses.
import type { ApprovalRule, OrgConfig } from '@/domain/config'
import { explainLevel, type LevelExplanation, type RuleEvalTask } from '@/domain/rules'
import type { ApprovalLevel, DepartmentId, Label } from '@/domain/primitives'
import { parseAmount } from './ruleForm'

export interface Sample {
  /** '' = no task type, the tags below are typed by hand. */
  typeKey: string
  tags: string[]
  /** '' = no platform. */
  platformKey: string
  /** Department key. */
  departmentKey: string
  amountText: string
  crossDepartment: boolean
}

export function emptySample(config: OrgConfig): Sample {
  const dept = config.departments.find((d) => d.active) ?? config.departments[0]
  return {
    typeKey: '',
    tags: [],
    platformKey: '',
    departmentKey: dept?.key ?? '',
    amountText: '',
    crossDepartment: false,
  }
}

/** Choosing a task type fills tags, department and platform from it (all still editable). */
export function sampleForType(config: OrgConfig, current: Sample, typeKey: string): Sample {
  const type = config.taskTypes.find((tt) => tt.key === typeKey)
  if (!type) return { ...current, typeKey: '' }
  return {
    ...current,
    typeKey,
    tags: [...type.tags],
    departmentKey: type.departmentKey,
    platformKey: type.platformKeys[0] ?? '',
  }
}

export interface ApproverRole {
  roleKey: string
  roleLabel: Label
  people: { id: string; name: string }[]
}

export interface ChainStep {
  level: ApprovalLevel
  roles: ApproverRole[]
}

export interface RuleTestResult {
  explained: LevelExplanation
  chain: ChainStep[]
  /** False when the sample's department key is not in the config (no names can be listed). */
  departmentFound: boolean
}

/** Who holds an approval level: the department's people, or (boss) the owners of the building. */
export function approversFor(
  config: OrgConfig,
  level: ApprovalLevel,
  departmentId: DepartmentId | null,
): ApproverRole[] {
  const roles = config.roles.filter((r) =>
    level === 'boss' ? r.caps.approveLevel === 'boss' || r.caps.humanOwner : r.caps.approveLevel === level,
  )
  return roles.map((role) => ({
    roleKey: role.key,
    roleLabel: role.label,
    people: config.employees
      .filter(
        (e) =>
          e.state === 'active' &&
          e.roleKey === role.key &&
          (level === 'boss' || (departmentId !== null && e.departmentId === departmentId)),
      )
      .map((e) => ({ id: e.id, name: e.name })),
  }))
}

export function evaluateSample(
  config: OrgConfig,
  rules: readonly ApprovalRule[],
  sample: Sample,
): RuleTestResult {
  const dept = config.departments.find((d) => d.key === sample.departmentKey)
  const departmentId = dept?.id ?? null
  const task: RuleEvalTask = {
    typeKey: sample.typeKey,
    tags: sample.tags,
    platformKey: sample.platformKey === '' ? null : sample.platformKey,
    departmentId: departmentId ?? ('dep_unknown' as DepartmentId),
    amountVnd: parseAmount(sample.amountText),
  }
  const explained = explainLevel(task, rules, config.policy, {
    crossDepartment: sample.crossDepartment,
    departmentKey: sample.departmentKey,
  })
  return {
    explained,
    chain: explained.chain.map((level) => ({
      level,
      roles: approversFor(config, level, departmentId),
    })),
    departmentFound: dept !== undefined,
  }
}

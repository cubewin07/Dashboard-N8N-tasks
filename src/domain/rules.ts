import type { ApprovalRule, Policy } from './config'
import { LEVEL_RANK, type ApprovalLevel, type DepartmentId } from './primitives'
import type { Task } from './work'

export interface RuleEvalTask {
  typeKey: string
  tags: readonly string[]
  platformKey: string | null
  departmentId: DepartmentId
  amountVnd: number | null
}

export interface RuleEvalContext {
  crossDepartment?: boolean
  departmentKey?: string
}

export interface RequiredLevelResult {
  level: ApprovalLevel
  matchedRuleIds: string[]
}

function matchesRule(
  task: RuleEvalTask,
  rule: ApprovalRule,
  ctx: RuleEvalContext,
): boolean {
  if (!rule.enabled) return false
  const { when } = rule

  let hasCondition = false

  if (when.taskTypes !== undefined) {
    hasCondition = true
    if (when.taskTypes.length === 0 || !when.taskTypes.includes(task.typeKey)) {
      return false
    }
  }

  if (when.tagsAny !== undefined) {
    hasCondition = true
    if (
      when.tagsAny.length === 0 ||
      !when.tagsAny.some((tag) => task.tags.includes(tag))
    ) {
      return false
    }
  }

  if (when.platformsAny !== undefined) {
    hasCondition = true
    if (
      when.platformsAny.length === 0 ||
      task.platformKey === null ||
      !when.platformsAny.includes(task.platformKey)
    ) {
      return false
    }
  }

  if (when.departmentsAny !== undefined) {
    hasCondition = true
    const matchesDeptId = when.departmentsAny.includes(task.departmentId)
    const matchesDeptKey =
      ctx.departmentKey !== undefined &&
      when.departmentsAny.includes(ctx.departmentKey)
    if (when.departmentsAny.length === 0 || (!matchesDeptId && !matchesDeptKey)) {
      return false
    }
  }

  if (when.amountVndGte !== undefined) {
    hasCondition = true
    if (task.amountVnd === null || task.amountVnd < when.amountVndGte) {
      return false
    }
  }

  if (when.crossDepartment !== undefined) {
    hasCondition = true
    if (Boolean(ctx.crossDepartment) !== when.crossDepartment) {
      return false
    }
  }

  return hasCondition
}

export function requiredLevel(
  task: RuleEvalTask | Task,
  rules: readonly ApprovalRule[],
  policy: Policy,
  ctx: RuleEvalContext = {},
): RequiredLevelResult {
  const sortedRules = [...rules].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  )

  const matched: ApprovalRule[] = []
  for (const rule of sortedRules) {
    if (matchesRule(task, rule, ctx)) {
      matched.push(rule)
    }
  }

  if (matched.length === 0) {
    return {
      level: policy.approvals.defaultLevel,
      matchedRuleIds: [],
    }
  }

  let highest: ApprovalLevel = matched[0]!.level
  for (let i = 1; i < matched.length; i += 1) {
    const candidate = matched[i]!.level
    if (LEVEL_RANK[candidate] > LEVEL_RANK[highest]) {
      highest = candidate
    }
  }

  return {
    level: highest,
    matchedRuleIds: matched.map((r) => r.id),
  }
}

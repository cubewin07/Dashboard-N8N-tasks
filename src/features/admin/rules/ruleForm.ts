// P10-T10 · The rule editor's draft shape and the pure helpers around it.
import type { ApprovalRule } from '@/domain/config'
import type { ApprovalLevel, Label } from '@/domain/primitives'
import { slugKey, uniqueKey } from '../shared/keys'

export type CrossChoice = 'any' | 'yes' | 'no'

/** What the form edits. `amountText` holds digits only; the input shows them grouped. */
export interface RuleForm {
  label: Label
  enabled: boolean
  level: ApprovalLevel
  taskTypes: string[]
  tagsAny: string[]
  platformsAny: string[]
  departmentsAny: string[]
  amountText: string
  cross: CrossChoice
}

export const LEVELS: readonly ApprovalLevel[] = ['reviewer', 'dept_manager', 'boss']

export function emptyRuleForm(): RuleForm {
  return {
    label: { vi: '', en: '' },
    enabled: true,
    level: 'dept_manager',
    taskTypes: [],
    tagsAny: [],
    platformsAny: [],
    departmentsAny: [],
    amountText: '',
    cross: 'any',
  }
}

export function formFromRule(rule: ApprovalRule): RuleForm {
  const { when } = rule
  return {
    label: { ...rule.label },
    enabled: rule.enabled,
    level: rule.level,
    taskTypes: [...(when.taskTypes ?? [])],
    tagsAny: [...(when.tagsAny ?? [])],
    platformsAny: [...(when.platformsAny ?? [])],
    departmentsAny: [...(when.departmentsAny ?? [])],
    amountText: when.amountVndGte === undefined ? '' : String(when.amountVndGte),
    cross: when.crossDepartment === undefined ? 'any' : when.crossDepartment ? 'yes' : 'no',
  }
}

/** Digits only ("3.000.000đ" → "3000000"). */
export function amountDigits(text: string): string {
  return text.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
}

export function parseAmount(text: string): number | null {
  const digits = amountDigits(text)
  return digits === '' ? null : Number(digits)
}

/** "3000000" → "3.000.000" (vi-VN grouping), "" stays "". */
export function formatAmountText(text: string): string {
  const n = parseAmount(text)
  return n === null ? '' : new Intl.NumberFormat('vi-VN').format(n)
}

/** A tag as the config stores it: lowercase snake_case. "Hoàn tiền" → "hoan_tien". */
export function normalizeTag(text: string): string {
  const trimmed = text.trim()
  return trimmed === '' ? '' : slugKey(trimmed)
}

/**
 * Build the rule from the form. Empty condition lists are left out: in the engine a present but
 * empty list never matches, an absent one is "no condition" (domain/rules.ts).
 */
export function ruleFromForm(form: RuleForm, base: { id: string; order: number }): ApprovalRule {
  const when: ApprovalRule['when'] = {}
  if (form.taskTypes.length > 0) when.taskTypes = [...form.taskTypes]
  if (form.tagsAny.length > 0) when.tagsAny = [...form.tagsAny]
  if (form.platformsAny.length > 0) when.platformsAny = [...form.platformsAny]
  if (form.departmentsAny.length > 0) when.departmentsAny = [...form.departmentsAny]
  const amount = parseAmount(form.amountText)
  if (amount !== null) when.amountVndGte = amount
  if (form.cross !== 'any') when.crossDepartment = form.cross === 'yes'
  const vi = form.label.vi.trim()
  return {
    id: base.id,
    order: base.order,
    enabled: form.enabled,
    label: { vi, en: form.label.en.trim() || vi },
    when,
    level: form.level,
  }
}

export function conditionCount(when: ApprovalRule['when']): number {
  return (
    (when.taskTypes?.length ? 1 : 0) +
    (when.tagsAny?.length ? 1 : 0) +
    (when.platformsAny?.length ? 1 : 0) +
    (when.departmentsAny?.length ? 1 : 0) +
    (when.amountVndGte !== undefined ? 1 : 0) +
    (when.crossDepartment !== undefined ? 1 : 0)
  )
}

/** New rule id from its Vietnamese label, unique among the existing ones. */
export function newRuleId(label: Label, existing: readonly ApprovalRule[]): string {
  const base = label.vi.trim() === '' ? 'rule' : slugKey(label.vi)
  return uniqueKey(
    base,
    existing.map((r) => r.id),
  )
}

/** Next `order` after the last rule. */
export function nextOrder(rules: readonly ApprovalRule[]): number {
  return rules.reduce((max, r) => Math.max(max, r.order), 0) + 1
}

/** Rules sorted the way the list shows them (and the engine reads them). */
export function sortRules(rules: readonly ApprovalRule[]): ApprovalRule[] {
  return [...rules].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/** Tags seen in task types and rules, for the tag input suggestions. */
export function suggestTags(
  taskTypes: readonly { tags: readonly string[] }[],
  rules: readonly ApprovalRule[],
): string[] {
  const seen = new Set<string>()
  for (const tt of taskTypes) for (const tag of tt.tags) seen.add(tag)
  for (const r of rules) for (const tag of r.when.tagsAny ?? []) seen.add(tag)
  return [...seen].sort()
}

export function formsEqual(a: RuleForm, b: RuleForm): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

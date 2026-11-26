// Pure helpers of the Roles tab (P10-T08, R3).
import type { ApprovalLevel, ModelTier, OrgConfig, RoleDef, WorkspaceKind } from '@/domain/config'
import { isBuiltInRole } from '@/domain/configChange'

export type CapKey = keyof RoleDef['caps']

/** Checkbox capabilities (approveLevel is a select of its own). */
export const BOOLEAN_CAPS = [
  'assignTasks',
  'distributeReviews',
  'answerQuestions',
  'doWork',
  'humanOwner',
] as const satisfies readonly CapKey[]

export const APPROVE_LEVELS: readonly ApprovalLevel[] = ['reviewer', 'dept_manager', 'boss']
export const MODEL_TIERS: readonly ModelTier[] = ['strong', 'standard', 'cheap']

/** Seats a custom role may use; boss_office / manager_office are the single seats of the built-ins. */
export const CUSTOM_WORKSPACES: readonly WorkspaceKind[] = ['desk', 'review_desk', 'private_office']

export type RoleDeleteBlock = { reason: 'builtIn' } | { reason: 'holders'; n: number }

/** Everyone holding the role, archived people included (history keeps pointing at the role). */
export function roleHolders(config: OrgConfig, key: string): number {
  return config.employees.filter((e) => e.roleKey === key).length
}

/** Why a role cannot be deleted; null when it can (custom role, zero holders). */
export function roleDeleteBlock(config: OrgConfig, role: RoleDef): RoleDeleteBlock | null {
  if (isBuiltInRole(role.key)) return { reason: 'builtIn' }
  const n = roleHolders(config, role.key)
  return n > 0 ? { reason: 'holders', n } : null
}

export interface RoleDraft {
  key: string
  label: RoleDef['label']
  scope: RoleDef['scope']
  caps: RoleDef['caps']
  modelTier: ModelTier
  /** Text of the number input; '' = no limit. */
  maxPerDepartment: string
  workspace: WorkspaceKind
}

export function blankRoleDraft(): RoleDraft {
  return {
    key: '',
    label: { vi: '', en: '' },
    scope: 'department',
    caps: {
      assignTasks: false,
      approveLevel: null,
      distributeReviews: false,
      answerQuestions: false,
      doWork: true,
      humanOwner: false,
    },
    modelTier: 'standard',
    maxPerDepartment: '',
    workspace: 'desk',
  }
}

export function draftFromRole(role: RoleDef): RoleDraft {
  return {
    key: role.key,
    label: { ...role.label },
    scope: role.scope,
    caps: { ...role.caps },
    modelTier: role.modelTier,
    maxPerDepartment: role.maxPerDepartment === null ? '' : String(role.maxPerDepartment),
    workspace: role.workspace,
  }
}

/** '' → null (no limit); a whole number ≥ 1 → that number; anything else → 'invalid'. */
export function parseMaxPerDepartment(text: string): number | null | 'invalid' {
  const t = text.trim()
  if (t === '') return null
  if (!/^\d+$/.test(t)) return 'invalid'
  const n = Number(t)
  return n >= 1 ? n : 'invalid'
}

export function sameRoleDraft(a: RoleDraft, b: RoleDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * The RoleDef a draft stands for. Built-in roles keep their `scope` and `caps.humanOwner` whatever
 * the draft says (R3); `sortOrder` is kept when editing and goes last for a new role.
 * Returns null while the draft is not saveable (empty label, bad limit).
 */
export function roleFromDraft(
  draft: RoleDraft,
  base: RoleDef | null,
  sortOrderForNew: number,
): RoleDef | null {
  const max = parseMaxPerDepartment(draft.maxPerDepartment)
  if (max === 'invalid' || draft.label.vi.trim() === '' || draft.key === '') return null
  const builtIn = base !== null && isBuiltInRole(base.key)
  const caps = builtIn ? { ...draft.caps, humanOwner: base.caps.humanOwner } : { ...draft.caps }
  return {
    key: base?.key ?? draft.key,
    // en is required by the schema; fall back to the Vietnamese text when it is left empty (R16).
    label: { vi: draft.label.vi.trim(), en: draft.label.en.trim() || draft.label.vi.trim() },
    scope: builtIn ? base.scope : draft.scope,
    caps,
    modelTier: draft.modelTier,
    maxPerDepartment: max,
    workspace: draft.workspace,
    sortOrder: base?.sortOrder ?? sortOrderForNew,
  }
}

import { describe, expect, it } from 'vitest'
import { makeSampleTask, makeSeedConfig } from '../__fixtures__/builders'
import { explainLevel, requiredLevel } from '../rules'

describe('explainLevel (P10-T11)', () => {
  const seed = makeSeedConfig()
  const { approvalRules: rules, policy } = seed

  it('refund with an irreversible tag -> boss via boss_sensitive, full chain', () => {
    const task = makeSampleTask({ tags: ['refund', 'irreversible'], amountVnd: 500_000 })
    const out = explainLevel(task, rules, policy)
    expect(out.level).toBe('boss')
    expect(out.defaulted).toBe(false)
    expect(out.decidedBy?.id).toBe('boss_sensitive')
    expect(out.matchedRules.map((r) => r.id)).toEqual(['boss_sensitive'])
    expect(out.chain).toEqual(['reviewer', 'dept_manager', 'boss'])
  })

  it('FAQ reply -> reviewer via reviewer_routine, chain stops at the reviewer', () => {
    const task = makeSampleTask({ tags: ['faq_reply'], amountVnd: null })
    const out = explainLevel(task, rules, policy)
    expect(out.level).toBe('reviewer')
    expect(out.decidedBy?.id).toBe('reviewer_routine')
    expect(out.chain).toEqual(['reviewer'])
  })

  it('untagged task -> the policy default (dept_manager), nothing matched', () => {
    const task = makeSampleTask({ tags: [], amountVnd: null })
    const out = explainLevel(task, rules, policy)
    expect(out.level).toBe(policy.approvals.defaultLevel)
    expect(out.level).toBe('dept_manager')
    expect(out.defaulted).toBe(true)
    expect(out.matchedRules).toEqual([])
    expect(out.decidedBy).toBeNull()
    expect(out.chain).toEqual(['reviewer', 'dept_manager'])
  })

  it('strictest wins: routine + tax lists both rules but is decided by the strict one', () => {
    const task = makeSampleTask({ tags: ['routine_draft', 'tax'], amountVnd: null })
    const out = explainLevel(task, rules, policy)
    expect(out.matchedRules.map((r) => r.id)).toEqual(['boss_sensitive', 'reviewer_routine'])
    expect(out.decidedBy?.id).toBe('boss_sensitive')
  })

  it('chain follows policy.approvals.chain = required_only', () => {
    const task = makeSampleTask({ tags: ['tax'], amountVnd: null })
    const out = explainLevel(task, rules, {
      ...policy,
      approvals: { ...policy.approvals, chain: 'required_only' },
    })
    expect(out.chain).toEqual(['boss'])
  })

  it('uses the given (draft) rules and ignores disabled ones', () => {
    const task = makeSampleTask({ tags: ['refund'], amountVnd: null })
    expect(explainLevel(task, rules, policy).level).toBe('dept_manager')
    const draft = [
      ...rules,
      {
        id: 'boss_refund',
        order: 9,
        enabled: true,
        label: { vi: 'Hoàn tiền', en: 'Refunds' },
        when: { tagsAny: ['refund'] },
        level: 'boss' as const,
      },
    ]
    expect(explainLevel(task, draft, policy).decidedBy?.id).toBe('boss_refund')
    const disabled = draft.map((r) => (r.id === 'boss_refund' ? { ...r, enabled: false } : r))
    expect(explainLevel(task, disabled, policy).defaulted).toBe(true)
  })

  it('agrees with requiredLevel on level and matched ids', () => {
    const tasks = [
      makeSampleTask({ tags: ['public_post'], amountVnd: null }),
      makeSampleTask({ tags: [], amountVnd: 3_000_000 }),
      makeSampleTask({ tags: [], amountVnd: null }),
    ]
    for (const task of tasks) {
      const base = requiredLevel(task, rules, policy, { crossDepartment: true })
      const out = explainLevel(task, rules, policy, { crossDepartment: true })
      expect(out.level).toBe(base.level)
      expect(out.matchedRules.map((r) => r.id)).toEqual(base.matchedRuleIds)
    }
  })
})

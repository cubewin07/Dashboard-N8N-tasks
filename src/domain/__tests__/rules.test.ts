import { describe, expect, it } from 'vitest'
import { makeSampleTask, makeSeedConfig } from '../__fixtures__/builders'
import { requiredLevel } from '../rules'

describe('approval rule engine (P03-T02)', () => {
  const seed = makeSeedConfig()
  const rules = seed.approvalRules
  const policy = seed.policy

  it.each([
    {
      name: 'refund tag -> boss (boss_sensitive)',
      task: makeSampleTask({ tags: ['refund'], amountVnd: null }),
      ctx: {},
      expectedLevel: 'boss',
      expectedRule: 'boss_sensitive',
    },
    {
      name: '2 500 000 VND -> boss (boss_big_amount)',
      task: makeSampleTask({ tags: [], amountVnd: 2_500_000 }),
      ctx: {},
      expectedLevel: 'boss',
      expectedRule: 'boss_big_amount',
    },
    {
      name: 'public post -> dept_manager (dm_public)',
      task: makeSampleTask({ tags: ['public_post'], amountVnd: null }),
      ctx: {},
      expectedLevel: 'dept_manager',
      expectedRule: 'dm_public',
    },
    {
      name: 'cross-department -> dept_manager (dm_cross_dept)',
      task: makeSampleTask({ tags: [], amountVnd: null }),
      ctx: { crossDepartment: true },
      expectedLevel: 'dept_manager',
      expectedRule: 'dm_cross_dept',
    },
    {
      name: 'routine draft -> reviewer (reviewer_routine)',
      task: makeSampleTask({ tags: ['routine_draft'], amountVnd: null }),
      ctx: {},
      expectedLevel: 'reviewer',
      expectedRule: 'reviewer_routine',
    },
    {
      name: 'routine + refund -> boss (strictest wins)',
      task: makeSampleTask({
        tags: ['routine_draft', 'refund'],
        amountVnd: null,
      }),
      ctx: {},
      expectedLevel: 'boss',
      expectedRule: 'boss_sensitive',
    },
    {
      name: 'no match -> policy defaultLevel (dept_manager)',
      task: makeSampleTask({ tags: ['unlisted_tag'], amountVnd: 100_000 }),
      ctx: {},
      expectedLevel: 'dept_manager',
      expectedRule: null,
    },
  ])('$name', ({ task, ctx, expectedLevel, expectedRule }) => {
    const res = requiredLevel(task, rules, policy, ctx)
    expect(res.level).toBe(expectedLevel)
    if (expectedRule) {
      expect(res.matchedRuleIds).toContain(expectedRule)
    } else {
      expect(res.matchedRuleIds).toEqual([])
    }
  })

  it('ignores disabled rules and supports AND across taskTypes, platformsAny, and departmentsAny', () => {
    const disabledRules = rules.map((r) =>
      r.id === 'boss_sensitive' ? { ...r, enabled: false } : r,
    )
    const resDisabled = requiredLevel(
      makeSampleTask({ tags: ['refund', 'routine_draft'] }),
      disabledRules,
      policy,
    )
    expect(resDisabled.level).toBe('reviewer')
    expect(resDisabled.matchedRuleIds).toEqual(['reviewer_routine'])

    const customRule = {
      id: 'combo_rule',
      order: 1,
      enabled: true,
      label: { vi: 'Combo', en: 'Combo' },
      when: {
        taskTypes: ['cs.chat_faq'],
        platformsAny: ['shopee'],
        departmentsAny: ['cs'],
        tagsAny: ['faq_reply'],
        amountVndGte: 500_000,
        crossDepartment: false,
      },
      level: 'boss' as const,
    }
    const matchingTask = makeSampleTask({
      typeKey: 'cs.chat_faq',
      platformKey: 'shopee',
      departmentId: 'dep_cs',
      tags: ['faq_reply'],
      amountVnd: 600_000,
    })
    expect(
      requiredLevel(matchingTask, [customRule], policy, {
        departmentKey: 'cs',
        crossDepartment: false,
      }),
    ).toEqual({
      level: 'boss',
      matchedRuleIds: ['combo_rule'],
    })

    // Missing platform match fails the AND rule
    expect(
      requiredLevel(
        { ...matchingTask, platformKey: 'lazada' },
        [customRule],
        policy,
        { departmentKey: 'cs', crossDepartment: false },
      ).matchedRuleIds,
    ).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { OrgConfigSchema } from '@/domain/config'
import {
  amountDigits,
  conditionCount,
  emptyRuleForm,
  formFromRule,
  formatAmountText,
  newRuleId,
  nextOrder,
  normalizeTag,
  parseAmount,
  ruleFromForm,
  sortRules,
  suggestTags,
} from '../ruleForm'

const seed = makeSeedConfig()

describe('rule form helpers (P10-T10)', () => {
  it('round-trips every seed rule through the form unchanged', () => {
    for (const rule of seed.approvalRules) {
      expect(ruleFromForm(formFromRule(rule), { id: rule.id, order: rule.order })).toEqual(rule)
    }
  })

  it('leaves empty condition lists out (an empty list would never match in the engine)', () => {
    const rule = ruleFromForm(
      { ...emptyRuleForm(), label: { vi: 'Thử', en: '' }, tagsAny: ['tax'] },
      { id: 'thu', order: 7 },
    )
    expect(rule.when).toEqual({ tagsAny: ['tax'] })
    expect(rule.label).toEqual({ vi: 'Thử', en: 'Thử' })
    expect(conditionCount(rule.when)).toBe(1)
    expect(conditionCount({})).toBe(0)
  })

  it('maps the cross-department tri-state', () => {
    const base = { ...emptyRuleForm(), label: { vi: 'a', en: 'a' } }
    const at = (cross: 'any' | 'yes' | 'no') => ruleFromForm({ ...base, cross }, { id: 'a', order: 1 }).when
    expect(at('any')).toEqual({})
    expect(at('yes')).toEqual({ crossDepartment: true })
    expect(at('no')).toEqual({ crossDepartment: false })
    expect(formFromRule({ ...seed.approvalRules[0]!, when: { crossDepartment: false } }).cross).toBe('no')
  })

  it('amount: digits only, grouped for display, 0 is a real amount', () => {
    expect(amountDigits('3.000.000đ')).toBe('3000000')
    expect(amountDigits('007')).toBe('7')
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('0')).toBe(0)
    expect(formatAmountText('3000000')).toBe('3.000.000')
    expect(formatAmountText('')).toBe('')
    const rule = ruleFromForm(
      { ...emptyRuleForm(), label: { vi: 'a', en: 'a' }, amountText: '0' },
      { id: 'a', order: 1 },
    )
    expect(rule.when.amountVndGte).toBe(0)
  })

  it('normalizes tags to snake_case without accents', () => {
    expect(normalizeTag('  Hoàn tiền ')).toBe('hoan_tien')
    expect(normalizeTag('tax')).toBe('tax')
    expect(normalizeTag('   ')).toBe('')
  })

  it('new rule id comes from the Vietnamese label and stays unique', () => {
    expect(newRuleId({ vi: 'Hoàn tiền lớn', en: '' }, seed.approvalRules)).toBe('hoan_tien_lon')
    expect(newRuleId({ vi: 'Boss sensitive', en: '' }, [{ ...seed.approvalRules[0]!, id: 'boss_sensitive' }])).toBe(
      'boss_sensitive_2',
    )
    expect(newRuleId({ vi: '', en: '' }, [])).toBe('rule')
  })

  it('orders: next order is after the last; sorting follows order then id', () => {
    expect(nextOrder(seed.approvalRules)).toBe(6)
    expect(nextOrder([])).toBe(1)
    const shuffled = [...seed.approvalRules].reverse()
    expect(sortRules(shuffled).map((r) => r.id)).toEqual(seed.approvalRules.map((r) => r.id))
  })

  it('suggests tags from task types and rules, sorted, no duplicates', () => {
    const tags = suggestTags(seed.taskTypes, seed.approvalRules)
    expect(tags).toContain('refund')
    expect(tags).toContain('tax')
    expect(new Set(tags).size).toBe(tags.length)
    expect([...tags].sort()).toEqual(tags)
  })

  it('a rule built from the form is accepted by the config schema', () => {
    const rule = ruleFromForm(
      {
        ...emptyRuleForm(),
        label: { vi: 'Hoàn tiền', en: 'Refunds' },
        level: 'boss',
        tagsAny: ['refund'],
        amountText: '500000',
        cross: 'no',
      },
      { id: 'hoan_tien', order: 9 },
    )
    const parsed = OrgConfigSchema.safeParse({ ...seed, approvalRules: [...seed.approvalRules, rule] })
    expect(parsed.success).toBe(true)
  })
})

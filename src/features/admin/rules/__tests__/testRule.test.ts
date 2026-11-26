import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { approversFor, emptySample, evaluateSample, sampleForType } from '../testRule'

const config = makeSeedConfig()

describe('rule tester model (P10-T11)', () => {
  it('choosing a task type fills tags, department and platform', () => {
    const sample = sampleForType(config, emptySample(config), 'cs.refund_request')
    expect(sample.typeKey).toBe('cs.refund_request')
    expect(sample.tags).toEqual(expect.arrayContaining(['refund', 'money']))
    expect(sample.departmentKey).toBe('cs')
    expect(sampleForType(config, sample, 'nope').typeKey).toBe('')
  })

  it('refund with an irreversible tag needs the boss through boss_sensitive', () => {
    const base = sampleForType(config, emptySample(config), 'cs.refund_request')
    const without = evaluateSample(config, config.approvalRules, base)
    expect(without.explained.level).toBe('dept_manager')
    const sample = { ...base, tags: [...base.tags, 'irreversible'], amountText: '500000' }
    const out = evaluateSample(config, config.approvalRules, sample)
    expect(out.explained.level).toBe('boss')
    expect(out.explained.decidedBy?.id).toBe('boss_sensitive')
    expect(out.chain.map((s) => s.level)).toEqual(['reviewer', 'dept_manager', 'boss'])
  })

  it('runs against the draft rules it is given', () => {
    const base = { ...emptySample(config), tags: ['refund'] }
    expect(evaluateSample(config, config.approvalRules, base).explained.level).toBe('dept_manager')
    const draft = [
      ...config.approvalRules,
      {
        id: 'boss_refund',
        order: 9,
        enabled: true,
        label: { vi: 'Hoàn tiền', en: 'Refunds' },
        when: { tagsAny: ['refund'] },
        level: 'boss' as const,
      },
    ]
    expect(evaluateSample(config, draft, base).explained.decidedBy?.id).toBe('boss_refund')
  })

  it('amount, cross-department and platform feed the engine', () => {
    const base = emptySample(config)
    expect(evaluateSample(config, config.approvalRules, { ...base, amountText: '3000000' }).explained.level).toBe(
      'boss',
    )
    expect(evaluateSample(config, config.approvalRules, { ...base, crossDepartment: true }).explained.decidedBy?.id).toBe(
      'dm_cross_dept',
    )
  })

  it('lists approvers: the department for reviewer/manager, the owners for the boss', () => {
    const dept = config.departments.find((d) => d.key === 'cs')!
    const manager = approversFor(config, 'dept_manager', dept.id).flatMap((r) => r.people)
    expect(manager.length).toBeGreaterThan(0)
    for (const p of manager) {
      const emp = config.employees.find((e) => e.id === p.id)!
      expect(emp.departmentId).toBe(dept.id)
    }
    const boss = approversFor(config, 'boss', dept.id).flatMap((r) => r.people)
    expect(boss.length).toBeGreaterThan(0)
    expect(approversFor(config, 'reviewer', null).flatMap((r) => r.people)).toEqual([])
  })

  it('reports an unknown department', () => {
    const out = evaluateSample(config, config.approvalRules, { ...emptySample(config), departmentKey: 'ghost' })
    expect(out.departmentFound).toBe(false)
  })
})

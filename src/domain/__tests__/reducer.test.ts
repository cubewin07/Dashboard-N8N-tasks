import { describe, expect, it } from 'vitest'
import { ev, makeConfig, makeEvent, makeState, t } from '../__fixtures__/builders'
import type { OfficeEvent } from '../events'
import { apply, applyConfigChange, initialState } from '../reducer'

describe('domain reducer', () => {
  it('builds initialState with active employees idle and archived employees excluded', () => {
    const cfg = makeConfig({
      employees: [
        ...makeConfig().employees,
        {
          id: 'emp_archived',
          name: 'Cũ',
          departmentId: 'dep_cs',
          roleKey: 'worker',
          specialties: ['customer_chat'],
          kind: 'temp',
          state: 'archived',
          reviewMode: 'always',
          modelTierOverride: null,
          bio: null,
          createdAt: '2026-11-10T00:00:00Z',
          createdBy: 'manager',
          archivedAt: '2026-11-10T01:00:00Z',
        },
      ],
    })
    const state = initialState(cfg, t(0))
    expect(Object.keys(state.people)).toHaveLength(4)
    expect(state.people.emp_mai?.activity).toBe('idle')
    expect(state.people.emp_archived).toBeUndefined()
  })

  it('ignores events with seq <= state.seq (idempotent)', () => {
    const s0 = makeState()
    const e1 = ev.personActivity('emp_mai', 'working', 2, t(2))
    const s1 = apply(s0, e1)
    expect(s1.seq).toBe(2)
    expect(s1.people.emp_mai?.activity).toBe('working')

    // Duplicate seq 2 and older seq 1 must be ignored
    const sDup = apply(s1, ev.personActivity('emp_mai', 'idle', 2, t(3)))
    expect(sDup).toBe(s1)
    const sOld = apply(s1, ev.personActivity('emp_mai', 'idle', 1, t(3)))
    expect(sOld).toBe(s1)
  })

  it('skips unknown event types and unknown employeeId on person.activity', () => {
    const s0 = makeState()
    const unknownTypeEvt = {
      ...ev.personActivity('emp_mai', 'working', 1, t(1)),
      type: 'future.unknown_event',
    } as unknown as OfficeEvent
    expect(apply(s0, unknownTypeEvt)).toBe(s0)

    const unknownEmpEvt = ev.personActivity('emp_ghost', 'working', 1, t(1))
    expect(apply(s0, unknownEmpEvt)).toBe(s0)
  })

  it('updates person.activity, system.heartbeat, config.changed, and other catalog events', () => {
    const s0 = makeState()
    const s1 = apply(
      s0,
      makeEvent(
        'person.activity',
        {
          employeeId: 'emp_mai',
          activity: 'working',
          locationHint: { floorKey: 'cs', target: 'desk' },
        },
        { seq: 1, at: t(1) },
      ),
    )
    expect(s1.people.emp_mai?.activity).toBe('working')
    expect(s1.people.emp_mai?.idleSince).toBeNull()
    expect(s1.people.emp_mai?.location).toEqual({ floorKey: 'cs', target: 'desk' })

    const s2 = apply(s1, ev.personActivity('emp_mai', 'idle', 2, t(2)))
    expect(s2.people.emp_mai?.activity).toBe('idle')
    expect(s2.people.emp_mai?.idleSince).toBe(t(2))

    const s3 = apply(
      s2,
      makeEvent(
        'system.heartbeat',
        { source: 'sim', version: '1.0.0' },
        { seq: 3, at: t(3) },
      ),
    )
    expect(s3.lastHeartbeat).toEqual({
      at: t(3),
      source: 'sim',
      version: '1.0.0',
    })

    const newEmployee = {
      id: 'emp_new' as const,
      name: 'Mới',
      departmentId: 'dep_cs' as const,
      roleKey: 'worker',
      specialties: ['customer_chat'],
      kind: 'temp' as const,
      state: 'active' as const,
      reviewMode: 'always' as const,
      modelTierOverride: null,
      bio: null,
      createdAt: t(4),
      createdBy: 'boss' as const,
      archivedAt: null,
    }
    const s4 = apply(
      s3,
      makeEvent(
        'config.changed',
        { change: { kind: 'employee.upsert', employee: newEmployee } },
        { seq: 4, at: t(4) },
      ),
    )
    expect(s4.people.emp_new?.activity).toBe('idle')

    const s5 = apply(s4, ev.taskCreated({}, 5, t(5)))
    expect(s5.seq).toBe(5)
    expect(s5.log).toHaveLength(5)
  })

  it('applies all ConfigChange variants cleanly', () => {
    const cfg = makeConfig()
    const dept2 = {
      ...cfg.departments[0],
      id: 'dep_mkt' as const,
      key: 'marketing',
      order: 2,
    }
    const c1 = applyConfigChange(cfg, { kind: 'department.upsert', department: dept2 })
    expect(c1.departments).toHaveLength(2)
    const c1Update = applyConfigChange(c1, {
      kind: 'department.upsert',
      department: { ...dept2, hours: 'office' },
    })
    expect(c1Update.departments[1]?.hours).toBe('office')

    const c2 = applyConfigChange(c1, {
      kind: 'department.reorder',
      ids: ['dep_mkt', 'dep_cs'],
    })
    expect(c2.departments.find((d) => d.id === 'dep_mkt')?.order).toBe(1)

    const customRole = { ...cfg.roles[5], key: 'intern', sortOrder: 6 }
    const c3 = applyConfigChange(c2, { kind: 'role.upsert', role: customRole })
    expect(c3.roles.some((r) => r.key === 'intern')).toBe(true)
    const c4 = applyConfigChange(c3, { kind: 'role.delete', key: 'intern' })
    expect(c4.roles.some((r) => r.key === 'intern')).toBe(false)

    const spec = {
      key: 'seo',
      label: { vi: 'SEO', en: 'SEO' },
      icon: 'Search',
      homeDepartmentKey: 'cs',
    }
    const c5 = applyConfigChange(c4, { kind: 'specialty.upsert', specialty: spec })
    expect(c5.specialties.some((s) => s.key === 'seo')).toBe(true)
    const c6 = applyConfigChange(c5, { kind: 'specialty.delete', key: 'seo' })
    expect(c6.specialties.some((s) => s.key === 'seo')).toBe(false)

    const c7 = applyConfigChange(
      c6,
      { kind: 'employee.archive', id: 'emp_mai', reason: 'dismissed' },
      t(10),
    )
    expect(c7.employees.find((e) => e.id === 'emp_mai')?.state).toBe('archived')
    const c8 = applyConfigChange(c7, { kind: 'employee.restore', id: 'emp_mai' })
    expect(c8.employees.find((e) => e.id === 'emp_mai')?.state).toBe('active')

    const c9 = applyConfigChange(c8, {
      kind: 'policy.set',
      policy: {
        ...cfg.policy,
        staffing: { ...cfg.policy.staffing, tempCap: 5 },
      },
    })
    expect(c9.policy.staffing.tempCap).toBe(5)

    const rule2 = { ...cfg.approvalRules[0], id: 'rule_2', order: 2 }
    const c10 = applyConfigChange(c9, { kind: 'rule.upsert', rule: rule2 })
    expect(c10.approvalRules).toHaveLength(2)
    const c11 = applyConfigChange(c10, {
      kind: 'rule.reorder',
      ids: ['rule_2', 'boss_sensitive'],
    })
    expect(c11.approvalRules.find((r) => r.id === 'rule_2')?.order).toBe(1)
    const c12 = applyConfigChange(c11, { kind: 'rule.delete', id: 'rule_2' })
    expect(c12.approvalRules).toHaveLength(1)

    const c13 = applyConfigChange(c12, {
      kind: 'platform.upsert',
      platform: { ...cfg.platforms[0], key: 'lazada' },
    })
    expect(c13.platforms).toHaveLength(2)

    const c14 = applyConfigChange(c13, {
      kind: 'shop.upsert',
      shop: { id: 'shop_laz_1', platformKey: 'lazada', name: 'Lazada 1', handle: null },
    })
    expect(c14.shops).toHaveLength(2)

    const c15 = applyConfigChange(c14, {
      kind: 'taskType.upsert',
      taskType: {
        key: 'cs.chat',
        departmentKey: 'cs',
        label: { vi: 'Chat', en: 'Chat' },
        specialty: 'customer_chat',
        tags: [],
        defaultPriority: 'normal',
        durationMinutes: [5, 10],
        platformKeys: ['shopee'],
        needsHelpFrom: [],
        carries: 'laptop',
      },
    })
    expect(c15.taskTypes).toHaveLength(1)

    const c16 = applyConfigChange(c15, { kind: 'config.replace', config: cfg })
    expect(c16).toBe(cfg)
  })
})

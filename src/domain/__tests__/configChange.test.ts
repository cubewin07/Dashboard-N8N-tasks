import { describe, expect, it } from 'vitest'
import { makeSeedConfig, t } from '../__fixtures__/builders'
import type { ConfigChange, OrgConfig } from '../config'
import {
  applyConfigChange,
  describeChange,
  EDITABLE_CONFIG_KEYS,
  isBuiltInRole,
  pickEditable,
} from '../configChange'

function frozenSeed(): OrgConfig {
  const cfg = makeSeedConfig()
  return JSON.parse(JSON.stringify(cfg)) as OrgConfig
}

/** Apply a change and assert the input was left untouched. */
function applyPure(cfg: OrgConfig, change: ConfigChange, now?: string): OrgConfig {
  const before = JSON.stringify(cfg)
  const next = applyConfigChange(cfg, change, now)
  expect(JSON.stringify(cfg)).toBe(before)
  return next
}

describe('applyConfigChange (P10-T01)', () => {
  const seed = frozenSeed()
  const dept = seed.departments[0]!
  const role = seed.roles.find((r) => r.key === 'worker')!
  const spec = seed.specialties[0]!
  const emp = seed.employees.find((e) => e.roleKey === 'worker')!
  const rule = seed.approvalRules[0]!
  const platform = seed.platforms[0]!
  const shop = seed.shops[0]!

  it('department.upsert updates in place and appends new ones', () => {
    const renamed = applyPure(seed, {
      kind: 'department.upsert',
      department: { ...dept, label: { vi: 'Đổi tên', en: 'Renamed' } },
    })
    expect(renamed.departments.find((d) => d.id === dept.id)?.label.vi).toBe('Đổi tên')
    expect(renamed.departments).toHaveLength(seed.departments.length)

    const added = applyPure(seed, {
      kind: 'department.upsert',
      department: { ...dept, id: 'dep_kho', key: 'kho', order: 99 },
    })
    expect(added.departments).toHaveLength(seed.departments.length + 1)
    expect(added.departments.at(-1)?.id).toBe('dep_kho')
  })

  it('department.reorder numbers listed ids 1..n and keeps unlisted ones after them', () => {
    const ids = seed.departments.map((d) => d.id).reverse()
    const next = applyPure(seed, { kind: 'department.reorder', ids })
    const byOrder = [...next.departments].sort((a, b) => a.order - b.order).map((d) => d.id)
    expect(byOrder).toEqual(ids)

    const partial = applyPure(seed, { kind: 'department.reorder', ids: [ids[0]!] })
    const sorted = [...partial.departments].sort((a, b) => a.order - b.order)
    expect(sorted[0]!.id).toBe(ids[0])
    expect(new Set(partial.departments.map((d) => d.order)).size).toBe(seed.departments.length)
  })

  it('role.upsert and role.delete', () => {
    const custom = { ...role, key: 'intern', label: { vi: 'Thực tập', en: 'Intern' } }
    const added = applyPure(seed, { kind: 'role.upsert', role: custom })
    expect(added.roles.some((r) => r.key === 'intern')).toBe(true)
    const edited = applyPure(added, { kind: 'role.upsert', role: { ...custom, modelTier: 'cheap' } })
    expect(edited.roles.find((r) => r.key === 'intern')?.modelTier).toBe('cheap')
    const removed = applyPure(edited, { kind: 'role.delete', key: 'intern' })
    expect(removed.roles.some((r) => r.key === 'intern')).toBe(false)
  })

  it('specialty.upsert and specialty.delete', () => {
    const renamed = applyPure(seed, {
      kind: 'specialty.upsert',
      specialty: { ...spec, label: { vi: 'Mới', en: 'New' } },
    })
    expect(renamed.specialties.find((s) => s.key === spec.key)?.label.vi).toBe('Mới')
    const removed = applyPure(seed, { kind: 'specialty.delete', key: spec.key })
    expect(removed.specialties.some((s) => s.key === spec.key)).toBe(false)
  })

  it('employee.upsert, employee.archive (stamps now) and employee.restore', () => {
    const moved = applyPure(seed, { kind: 'employee.upsert', employee: { ...emp, name: 'Tên mới' } })
    expect(moved.employees.find((e) => e.id === emp.id)?.name).toBe('Tên mới')

    const archived = applyPure(seed, { kind: 'employee.archive', id: emp.id, reason: 'dismissed' }, t(5))
    const a = archived.employees.find((e) => e.id === emp.id)!
    expect(a.state).toBe('archived')
    expect(a.archivedAt).toBe(t(5))

    const again = applyPure(archived, { kind: 'employee.archive', id: emp.id, reason: 'cap' }, t(9))
    expect(again.employees.find((e) => e.id === emp.id)?.archivedAt).toBe(t(5))

    const restored = applyPure(archived, { kind: 'employee.restore', id: emp.id })
    const r = restored.employees.find((e) => e.id === emp.id)!
    expect(r.state).toBe('active')
    expect(r.archivedAt).toBeNull()
  })

  it('policy.set replaces the policy', () => {
    const policy = { ...seed.policy, staffing: { ...seed.policy.staffing, tempCap: 4 } }
    const next = applyPure(seed, { kind: 'policy.set', policy })
    expect(next.policy.staffing.tempCap).toBe(4)
  })

  it('rule.upsert, rule.delete and rule.reorder', () => {
    const disabled = applyPure(seed, { kind: 'rule.upsert', rule: { ...rule, enabled: false } })
    expect(disabled.approvalRules.find((r) => r.id === rule.id)?.enabled).toBe(false)
    const added = applyPure(seed, { kind: 'rule.upsert', rule: { ...rule, id: 'new_rule' } })
    expect(added.approvalRules).toHaveLength(seed.approvalRules.length + 1)
    const removed = applyPure(seed, { kind: 'rule.delete', id: rule.id })
    expect(removed.approvalRules.some((r) => r.id === rule.id)).toBe(false)
    const ids = seed.approvalRules.map((r) => r.id).reverse()
    const reordered = applyPure(seed, { kind: 'rule.reorder', ids })
    expect([...reordered.approvalRules].sort((a, b) => a.order - b.order).map((r) => r.id)).toEqual(ids)
  })

  it('platform.upsert and shop.upsert', () => {
    const off = applyPure(seed, { kind: 'platform.upsert', platform: { ...platform, active: false } })
    expect(off.platforms.find((p) => p.key === platform.key)?.active).toBe(false)
    const shopAdded = applyPure(seed, { kind: 'shop.upsert', shop: { ...shop, id: 'shop_new', name: 'Mới' } })
    expect(shopAdded.shops.some((s) => s.id === 'shop_new')).toBe(true)
    const shopRenamed = applyPure(seed, { kind: 'shop.upsert', shop: { ...shop, name: 'Đổi' } })
    expect(shopRenamed.shops.find((s) => s.id === shop.id)?.name).toBe('Đổi')
  })

  it('taskType.upsert', () => {
    const tt = seed.taskTypes[0]!
    const next = applyPure(seed, {
      kind: 'taskType.upsert',
      taskType: { ...tt, label: { vi: 'Khác', en: 'Other' } },
    })
    expect(next.taskTypes.find((x) => x.key === tt.key)?.label.vi).toBe('Khác')
  })

  it('config.replace swaps editable parts and keeps building, templates and palette', () => {
    const other: OrgConfig = {
      ...seed,
      departments: seed.departments.slice(0, 2),
      building: { ...seed.building, stack: [{ kind: 'departments' }] },
      floorTemplates: [],
      palette: [],
    }
    const next = applyPure(seed, { kind: 'config.replace', config: other })
    expect(next.departments).toEqual(other.departments)
    expect(next.building).toBe(seed.building)
    expect(next.floorTemplates).toBe(seed.floorTemplates)
    expect(next.palette).toBe(seed.palette)
  })
})

describe('config change helpers', () => {
  it('pickEditable returns exactly the editable keys', () => {
    const seed = makeSeedConfig()
    expect(Object.keys(pickEditable(seed)).sort()).toEqual([...EDITABLE_CONFIG_KEYS].sort())
  })

  it('isBuiltInRole', () => {
    expect(isBuiltInRole('owner')).toBe(true)
    expect(isBuiltInRole('intern')).toBe(false)
  })

  it('describeChange names entity and action', () => {
    expect(describeChange({ kind: 'rule.delete', id: 'x' })).toEqual({
      entity: 'approval_rules',
      entityId: 'x',
      action: 'delete',
    })
    expect(describeChange({ kind: 'employee.archive', id: 'emp_a', reason: 'cap' }).action).toBe('archive')
  })
})

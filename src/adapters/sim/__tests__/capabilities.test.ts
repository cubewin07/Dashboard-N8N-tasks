import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { createBrainContext } from '../brain/tick'
import {
  getDeptManagerEmployeeId,
  getManagerEmployeeId,
  getPrimaryOwnerEmployeeId,
  resolveEventActor,
} from '../brain/context'

// Rule 9: config is data. Renaming role keys must not change who the sim
// treats as the owner or the managers.
function renamedConfig() {
  const cfg = makeSeedConfig()
  const rename: Record<string, string> = {
    owner: 'chairman',
    manager: 'ops_head',
    dept_manager: 'floor_head',
  }
  return {
    ...cfg,
    roles: cfg.roles.map((r) => ({ ...r, key: rename[r.key] ?? r.key })),
    employees: cfg.employees.map((e) => ({ ...e, roleKey: rename[e.roleKey] ?? e.roleKey })),
  }
}

describe('sim reasons about role capabilities, not role keys', () => {
  it('finds the owner, manager and department managers after role keys are renamed', () => {
    const original = createBrainContext(makeSeedConfig(), 1)
    const renamed = createBrainContext(renamedConfig(), 1)

    expect(getPrimaryOwnerEmployeeId(renamed)).toBe(getPrimaryOwnerEmployeeId(original))
    expect(getManagerEmployeeId(renamed)).toBe(getManagerEmployeeId(original))
    const dept = original.state.config.departments[0]!.id
    expect(getDeptManagerEmployeeId(renamed, dept)).toBe(getDeptManagerEmployeeId(original, dept))
  })

  it('marks events by the owner as owner events', () => {
    const ctx = createBrainContext(renamedConfig(), 1)
    const ownerId = getPrimaryOwnerEmployeeId(ctx)
    expect(resolveEventActor(ctx, ownerId)).toEqual({ kind: 'owner', id: ownerId })
  })
})

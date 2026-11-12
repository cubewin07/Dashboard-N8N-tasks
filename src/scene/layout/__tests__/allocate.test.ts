import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { Employee } from '@/domain/config'
import type { EmployeeId } from '@/domain/primitives'
import { computeBuildingLayout } from '../buildingLayout'

describe('allocateSeats (R4)', () => {
  it('R4: seats all 28 seed employees uniquely in matching workspace slots', () => {
    const config = makeSeedConfig()
    const layout = computeBuildingLayout(config)
    const assignments = Object.values(layout.seatAssignments)

    expect(assignments).toHaveLength(28)

    // No two employees share (floorKey, slotId)
    const occupied = new Set(assignments.map((a) => `${a.floorKey}::${a.slotId}`))
    expect(occupied.size).toBe(28)

    // Both owners on boss floor in boss_desk_*
    const owners = config.employees.filter((e) => e.roleKey === 'owner')
    expect(owners).toHaveLength(2)
    for (const owner of owners) {
      const seat = layout.seatAssignments[owner.id]
      expect(seat?.floorKey).toBe('boss')
      expect(seat?.slotId).toMatch(/^boss_desk_/)
    }

    // Thu (general manager) in manager_office on management floor
    const managers = config.employees.filter((e) => e.roleKey === 'manager')
    expect(managers).toHaveLength(1)
    expect(layout.seatAssignments[managers[0]!.id]).toEqual({
      employeeId: managers[0]!.id,
      floorKey: 'management',
      slotId: 'manager_office',
    })

    // Each dept_manager in private_office on their department floor
    for (const dept of config.departments) {
      const dm = config.employees.find(
        (e) => e.departmentId === dept.id && e.roleKey === 'dept_manager',
      )!
      expect(layout.seatAssignments[dm.id]).toEqual({
        employeeId: dm.id,
        floorKey: dept.key,
        slotId: 'private_office',
      })

      // Lead and reviewers in review_desk_* on their department floor
      const lead = config.employees.find(
        (e) => e.departmentId === dept.id && e.roleKey === 'lead',
      )!
      expect(layout.seatAssignments[lead.id]).toEqual({
        employeeId: lead.id,
        floorKey: dept.key,
        slotId: 'review_desk_1',
      })

      const reviewers = config.employees.filter(
        (e) => e.departmentId === dept.id && e.roleKey === 'reviewer',
      )
      for (const rev of reviewers) {
        const seat = layout.seatAssignments[rev.id]
        expect(seat?.floorKey).toBe(dept.key)
        expect(seat?.slotId).toMatch(/^review_desk_/)
      }
    }
  })

  it('R4: adding a new worker preserves existing employees seats, and archived employees get no seat', () => {
    const base = makeSeedConfig()
    const before = computeBuildingLayout(base)

    const newWorker: Employee = {
      id: 'emp_new_worker' as EmployeeId,
      name: 'Nhân viên mới',
      departmentId: 'dep_cs',
      roleKey: 'worker',
      specialties: ['customer_chat'],
      kind: 'temp',
      state: 'active',
      reviewMode: 'always',
      modelTierOverride: null,
      bio: null,
      createdAt: '2026-12-01T00:00:00Z',
      createdBy: 'manager',
      archivedAt: null,
    }
    const archivedWorker: Employee = {
      ...newWorker,
      id: 'emp_archived_worker' as EmployeeId,
      state: 'archived',
      archivedAt: '2026-12-02T00:00:00Z',
    }

    const after = computeBuildingLayout({
      ...base,
      employees: [...base.employees, newWorker, archivedWorker],
    })

    for (const emp of base.employees) {
      expect(after.seatAssignments[emp.id]).toEqual(before.seatAssignments[emp.id])
    }
    expect(after.seatAssignments[newWorker.id]).toBeDefined()
    expect(after.seatAssignments[newWorker.id]?.floorKey).toBe('cs')
    expect(after.seatAssignments[archivedWorker.id]).toBeUndefined()
  })

  it('R4: overflows extra review_desk staff to regular desks and >16 desk staff to annex floor', () => {
    const base = makeSeedConfig()
    const extraReviewers: Employee[] = Array.from({ length: 4 }, (_, i) => ({
      id: `emp_extra_rev_${i + 1}` as EmployeeId,
      name: `Reviewer Extra ${i + 1}`,
      departmentId: 'dep_cs',
      roleKey: 'reviewer',
      specialties: ['customer_chat'],
      kind: 'core',
      state: 'active',
      reviewMode: 'always',
      modelTierOverride: null,
      bio: null,
      createdAt: `2026-11-15T00:0${i}:00Z`,
      createdBy: 'boss',
      archivedAt: null,
    }))

    const layout = computeBuildingLayout({
      ...base,
      employees: [...base.employees, ...extraReviewers],
    })

    // CS seed has 1 lead + 2 reviewers (3/4 review_desks taken).
    // extraReviewers[0] takes review_desk_4; [1..3] overflow to desk_1..desk_3.
    expect(layout.seatAssignments[extraReviewers[0]!.id]?.slotId).toBe('review_desk_4')
    expect(layout.seatAssignments[extraReviewers[1]!.id]?.slotId).toBe('desk_1')
    expect(layout.seatAssignments[extraReviewers[2]!.id]?.slotId).toBe('desk_2')
    expect(layout.seatAssignments[extraReviewers[3]!.id]?.slotId).toBe('desk_3')
  })

  it('keeps everybody in their seat when somebody senior is hired (P04)', () => {
    const base = makeSeedConfig()
    const before = computeBuildingLayout(base)
    const template = base.employees.find(
      (e) => e.departmentId === 'dep_cs' && before.seatOf[e.id]?.slotId.startsWith('desk_'),
    )!
    // Created long ago, so a fresh allocation would put them first in line.
    const hire: Employee = {
      ...template,
      id: 'emp_aaa_hire' as EmployeeId,
      name: 'Người mới',
      createdAt: '2020-01-01T00:00:00Z',
    }
    const config = { ...base, employees: [...base.employees, hire] }

    const after = computeBuildingLayout(config, before)
    for (const [id, seat] of Object.entries(before.seatOf)) {
      expect(after.seatOf[id as EmployeeId]).toEqual(seat)
    }
    const seat = after.seatOf[hire.id]
    expect(seat).toBeDefined()
    const taken = Object.values(before.seatOf).map((a) => `${a.floorKey}::${a.slotId}`)
    expect(taken).not.toContain(`${seat!.floorKey}::${seat!.slotId}`)
    expect(after.floors[after.byKey[seat!.floorKey]!]!.occupants[seat!.slotId]).toBe(hire.id)
  })
})

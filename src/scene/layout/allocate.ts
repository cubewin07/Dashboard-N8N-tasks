import type { Employee, OrgConfig, RoleDef, Slot } from '@/domain/config'
import type { EmployeeId } from '@/domain/primitives'
import type { FloorLayout, SeatAssignment } from './types'

function compareEmployees(
  a: Employee,
  b: Employee,
  roleByKey: ReadonlyMap<string, RoleDef>,
): number {
  const sortA = roleByKey.get(a.roleKey)?.sortOrder ?? 999
  const sortB = roleByKey.get(b.roleKey)?.sortOrder ?? 999
  if (sortA !== sortB) {
    return sortA - sortB
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt.localeCompare(b.createdAt)
  }
  return a.id.localeCompare(b.id)
}

/**
 * Gives every active employee a seat. With `previous`, people keep the seat
 * they already had (as long as it still exists), so a hire never makes the
 * rest of the office swap desks.
 */
export function allocateSeats(
  config: OrgConfig,
  floors: readonly FloorLayout[],
  previous?: Readonly<Record<EmployeeId, SeatAssignment>>,
): Record<EmployeeId, SeatAssignment> {
  const roleByKey = new Map<string, RoleDef>()
  for (const role of config.roles) {
    roleByKey.set(role.key, role)
  }

  const activeEmployees = config.employees
    .filter((e) => e.state === 'active')
    .slice()
    .sort((a, b) => compareEmployees(a, b, roleByKey))

  const takenSlotKeys = new Set<string>()
  const assignments: Record<EmployeeId, SeatAssignment> = {}

  const claimSlot = (
    empId: EmployeeId,
    candidateFloors: readonly FloorLayout[],
    predicate: (slot: Slot) => boolean,
  ): boolean => {
    for (const floor of candidateFloors) {
      for (const slot of floor.slots) {
        const key = `${floor.key}::${slot.id}`
        if (takenSlotKeys.has(key)) {
          continue
        }
        if (predicate(slot)) {
          takenSlotKeys.add(key)
          assignments[empId] = {
            employeeId: empId,
            floorKey: floor.key,
            slotId: slot.id,
          }
          return true
        }
      }
    }
    return false
  }

  if (previous) {
    const floorByKey = new Map(floors.map((f) => [f.key, f]))
    for (const emp of activeEmployees) {
      const prev = previous[emp.id]
      if (!prev) continue
      const key = `${prev.floorKey}::${prev.slotId}`
      const floor = floorByKey.get(prev.floorKey)
      if (!floor || takenSlotKeys.has(key)) continue
      if (!floor.slots.some((s) => s.id === prev.slotId)) continue
      takenSlotKeys.add(key)
      assignments[emp.id] = { employeeId: emp.id, floorKey: prev.floorKey, slotId: prev.slotId }
    }
  }

  const bossFloors = floors.filter((f) => f.kind === 'boss')
  const managementFloors = floors.filter((f) => f.kind === 'management')

  for (const emp of activeEmployees) {
    if (assignments[emp.id]) continue
    const role = roleByKey.get(emp.roleKey)
    if (!role) {
      continue
    }

    if (role.workspace === 'boss_office') {
      claimSlot(emp.id, bossFloors, (s) => s.type === 'boss_desk')
      continue
    }

    if (role.workspace === 'manager_office') {
      claimSlot(emp.id, managementFloors, (s) => s.type === 'manager_office')
      continue
    }

    if (!emp.departmentId) {
      continue
    }

    const deptFloors = floors
      .filter((f) => f.kind === 'department' && f.departmentId === emp.departmentId)
      .slice()
      .sort((a, b) => a.annexIndex - b.annexIndex)

    const mainDeptFloors = deptFloors.filter((f) => f.annexIndex === 0)

    if (role.workspace === 'private_office') {
      claimSlot(emp.id, mainDeptFloors, (s) => s.type === 'private_office')
      continue
    }

    if (role.workspace === 'review_desk') {
      const matchedHint = claimSlot(
        emp.id,
        mainDeptFloors,
        (s) => s.type === 'review_desk' && s.roleHint === role.key,
      )
      if (!matchedHint) {
        const matchedAnyReview = claimSlot(
          emp.id,
          mainDeptFloors,
          (s) => s.type === 'review_desk',
        )
        if (!matchedAnyReview) {
          claimSlot(emp.id, deptFloors, (s) => s.type === 'desk')
        }
      }
      continue
    }

    if (role.workspace === 'desk') {
      claimSlot(emp.id, deptFloors, (s) => s.type === 'desk')
    }
  }

  return assignments
}

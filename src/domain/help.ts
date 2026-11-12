import type { Employee, Policy } from './config'
import type { EmployeeId } from './primitives'
import type { HelpRequest, OfficeState } from './work'

export function pickHelper(
  specialty: string,
  state: OfficeState,
  excludeIds: readonly EmployeeId[] = [],
): EmployeeId | null {
  const excluded = new Set<EmployeeId>(excludeIds)
  const roleMap = new Map(state.config.roles.map((r) => [r.key, r]))

  const candidates: Array<{
    emp: Employee
    isIdle: boolean
    lastActiveMs: number
  }> = []

  for (const emp of state.config.employees) {
    if (emp.state !== 'active') continue
    if (excluded.has(emp.id)) continue
    if (!emp.specialties.includes(specialty)) continue

    const role = roleMap.get(emp.roleKey)
    if (role?.caps.humanOwner) continue

    const runtime = state.people[emp.id]
    if (!runtime) continue
    if (runtime.activity === 'off_shift' || runtime.activity === 'helping') continue

    candidates.push({
      emp,
      isIdle: runtime.activity === 'idle',
      lastActiveMs: Date.parse(runtime.lastActiveAt),
    })
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    if (a.isIdle !== b.isIdle) {
      return a.isIdle ? -1 : 1
    }
    if (a.lastActiveMs !== b.lastActiveMs) {
      return a.lastActiveMs - b.lastActiveMs
    }
    return a.emp.id < b.emp.id ? -1 : a.emp.id > b.emp.id ? 1 : 0
  })

  return candidates[0]!.emp.id
}

export function onHelpTimeout(
  help: Pick<HelpRequest, 'round'>,
  policy: Policy,
): 'retry' | 'escalate' {
  if (help.round < policy.help.maxRounds) {
    return 'retry'
  }
  return 'escalate'
}

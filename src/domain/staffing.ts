import type { DepartmentId, EmployeeId, Iso } from './primitives'
import type { OfficeState } from './work'

export interface HirePlanRequest {
  requestedBy?: 'boss' | 'manager'
  by?: 'boss' | 'manager'
  departmentId?: DepartmentId
  roleKey?: string
  specialties?: readonly string[]
  ignoreCap?: boolean
}

export type HirePlan =
  | { kind: 'hire' }
  | { kind: 'hire_after_archive'; archiveId: EmployeeId }
  | { kind: 'needs_boss' }

const MS_PER_MINUTE = 60_000

export function longestIdleTemp(
  state: OfficeState,
  now: Iso,
): EmployeeId | null {
  const nowMs = Date.parse(now)
  const minIdleMs =
    state.config.policy.staffing.minIdleMinutesBeforeDrop * MS_PER_MINUTE

  const eligible: Array<{
    id: EmployeeId
    idleSinceMs: number
    createdAt: string
  }> = []

  for (const emp of state.config.employees) {
    if (emp.state !== 'active' || emp.kind !== 'temp') continue
    const runtime = state.people[emp.id]
    if (!runtime || runtime.activity !== 'idle' || !runtime.idleSince) continue
    const idleSinceMs = Date.parse(runtime.idleSince)
    const idleMs = nowMs - idleSinceMs
    if (idleMs >= minIdleMs) {
      eligible.push({
        id: emp.id,
        idleSinceMs,
        createdAt: emp.createdAt,
      })
    }
  }

  if (eligible.length === 0) return null

  eligible.sort((a, b) => {
    if (a.idleSinceMs !== b.idleSinceMs) {
      return a.idleSinceMs - b.idleSinceMs
    }
    const createdCmp = a.createdAt.localeCompare(b.createdAt)
    if (createdCmp !== 0) return createdCmp
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  return eligible[0]!.id
}

export function planHire(
  request: HirePlanRequest,
  state: OfficeState,
  now: Iso,
): HirePlan {
  if (request.ignoreCap) {
    return { kind: 'hire' }
  }

  const activeTempCount = state.config.employees.filter(
    (e) => e.state === 'active' && e.kind === 'temp',
  ).length
  const cap = state.config.policy.staffing.tempCap

  if (activeTempCount < cap) {
    return { kind: 'hire' }
  }

  const archiveId = longestIdleTemp(state, now)
  if (archiveId !== null) {
    return { kind: 'hire_after_archive', archiveId }
  }

  const initiator = request.requestedBy ?? request.by ?? 'manager'
  if (initiator === 'boss') {
    return { kind: 'hire' }
  }

  return { kind: 'needs_boss' }
}

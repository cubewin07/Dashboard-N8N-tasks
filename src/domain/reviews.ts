import type { Employee, Policy } from './config'
import {
  LEVEL_RANK,
  type ApprovalLevel,
  type DepartmentId,
  type EmployeeId,
} from './primitives'
import type { OfficeState, ReviewItem, Task } from './work'

export const ORDERED_APPROVAL_LEVELS: readonly ApprovalLevel[] = [
  'reviewer',
  'dept_manager',
  'boss',
]

export interface ChainForOptions {
  workerReviewMode?: Employee['reviewMode']
  taskTags?: readonly string[]
}

export function chainFor(
  level: ApprovalLevel,
  policy: Policy,
  options?: ChainForOptions,
): ApprovalLevel[] {
  if (
    options?.workerReviewMode === 'when_important' &&
    level === 'reviewer' &&
    options.taskTags?.includes('routine_draft')
  ) {
    return []
  }

  if (policy.approvals.chain === 'required_only') {
    return [level]
  }

  return ORDERED_APPROVAL_LEVELS.filter((l) => LEVEL_RANK[l] <= LEVEL_RANK[level])
}

function countOpenPile(state: OfficeState): Map<EmployeeId, number> {
  const counts = new Map<EmployeeId, number>()
  for (const rev of Object.values(state.reviews)) {
    if (rev.status === 'pending' || rev.status === 'in_review') {
      counts.set(rev.assigneeId, (counts.get(rev.assigneeId) ?? 0) + 1)
    }
  }
  return counts
}

export function pickApprover(
  level: ApprovalLevel,
  task: Pick<Task, 'departmentId'>,
  state: OfficeState,
): EmployeeId | null {
  const roleMap = new Map(state.config.roles.map((r) => [r.key, r]))
  const pileCounts = countOpenPile(state)

  const activeEmployees = state.config.employees.filter(
    (e) => e.state === 'active' && Boolean(state.people[e.id]),
  )

  const sortByLoadThenId = (candidates: Employee[]): Employee[] =>
    [...candidates].sort((a, b) => {
      const loadA = pileCounts.get(a.id) ?? 0
      const loadB = pileCounts.get(b.id) ?? 0
      if (loadA !== loadB) return loadA - loadB
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

  if (level === 'reviewer') {
    const reviewers = activeEmployees.filter(
      (e) =>
        e.departmentId === task.departmentId &&
        roleMap.get(e.roleKey)?.caps.approveLevel === 'reviewer',
    )
    const sorted = sortByLoadThenId(reviewers)
    if (sorted.length > 0) {
      return sorted[0]!.id
    }
    // Fallback to dept_manager if department has no active reviewer
    return pickApprover('dept_manager', task, state)
  }

  if (level === 'dept_manager') {
    const managers = activeEmployees.filter(
      (e) =>
        e.departmentId === task.departmentId &&
        roleMap.get(e.roleKey)?.caps.approveLevel === 'dept_manager',
    )
    const sorted = sortByLoadThenId(managers)
    if (sorted.length > 0) {
      return sorted[0]!.id
    }
    return pickApprover('boss', task, state)
  }

  // level === 'boss'
  const owners = activeEmployees.filter((e) => {
    const role = roleMap.get(e.roleKey)
    return role?.caps.approveLevel === 'boss' || role?.caps.humanOwner === true
  })
  const sortedOwners = sortByLoadThenId(owners)
  return sortedOwners[0]?.id ?? null
}

export function pickLeadForDepartment(
  departmentId: DepartmentId,
  state: OfficeState,
): EmployeeId | null {
  const roleMap = new Map(state.config.roles.map((r) => [r.key, r]))
  const leads = state.config.employees
    .filter(
      (e) =>
        e.state === 'active' &&
        e.departmentId === departmentId &&
        Boolean(state.people[e.id]) &&
        roleMap.get(e.roleKey)?.caps.distributeReviews === true,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return leads[0]?.id ?? null
}

export function nextInChain(
  review: Pick<ReviewItem, 'level' | 'status'>,
  task: Pick<Task, 'requiredLevel' | 'tags'>,
  policy: Policy,
): ApprovalLevel | null {
  if (review.status === 'changes_requested' || review.status === 'rejected') {
    return null
  }
  if (LEVEL_RANK[review.level] >= LEVEL_RANK[task.requiredLevel]) {
    return null
  }

  const chain = chainFor(task.requiredLevel, policy)
  const idx = chain.indexOf(review.level)
  if (idx >= 0 && idx + 1 < chain.length) {
    return chain[idx + 1]!
  }
  return task.requiredLevel
}

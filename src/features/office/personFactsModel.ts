import type { CarriedItem } from '@/domain/config'
import type { EmployeeId } from '@/domain/primitives'
import { pileFor, queueFor, waitingSeatsFor } from '@/domain/selectors'
import type { OfficeState, PersonActivity } from '@/domain/work'

/**
 * Everything the 3D scene shows about one person, as 2D facts for the drawer
 * (P05 R13): status, task, platform, carrying, pile and waiting position.
 * Pure: reads only the domain state, never the director.
 */
export interface PersonFacts {
  activity: PersonActivity
  taskTitle: string
  platformKey: string | null
  carrying: CarriedItem | null
  pileCount: number
  queueCount: number
  waiting: WaitingPosition | null
}

export interface WaitingPosition {
  targetId: EmployeeId
  /** 1-based place among the in-person askers of the target, by arrival. */
  position: number
}

/**
 * Where `employeeId` sits in the waiting order of the person they asked in
 * person. The order is the domain's (`waitingSeatsFor`), the same one the
 * director uses to give out bench seats. The earliest open question wins.
 */
export function waitingPositionFor(
  state: OfficeState,
  employeeId: EmployeeId,
): WaitingPosition | null {
  const own = Object.values(state.questions)
    .filter((q) => q.fromId === employeeId && q.status === 'open' && q.inPerson)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.id < b.id ? -1 : 1))
  for (const q of own) {
    const index = waitingSeatsFor(state, q.toId).findIndex((x) => x.id === q.id)
    if (index >= 0) return { targetId: q.toId, position: index + 1 }
  }
  return null
}

export function personFacts(state: OfficeState, employeeId: EmployeeId): PersonFacts {
  const runtime = state.people[employeeId]
  const task = runtime?.taskId ? state.tasks[runtime.taskId] : undefined
  return {
    activity: runtime?.activity ?? 'idle',
    taskTitle: task?.title ?? '',
    platformKey: runtime?.platformKey ?? task?.platformKey ?? null,
    carrying: runtime?.carrying ?? null,
    pileCount: pileFor(state, employeeId).length,
    queueCount: queueFor(state, employeeId).length,
    waiting: waitingPositionFor(state, employeeId),
  }
}

export const EMPTY_FACTS: PersonFacts = {
  activity: 'idle',
  taskTitle: '',
  platformKey: null,
  carrying: null,
  pileCount: 0,
  queueCount: 0,
  waiting: null,
}

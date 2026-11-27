import type { ApprovalLevel, Priority } from '@/domain/primitives'
import { intRange, pick } from '../rng'
import {
  requestInitialReviewOrComplete,
  stepAssignments,
  stepWorkers,
} from '../brain/agents'
import {
  createTaskInBrain,
  departmentWorkers,
  emitSimEvent,
  getDeptManagerEmployeeId,
  type SimBrainContext,
} from '../brain/context'

/**
 * "Ngày bận rộn" (P05-T15): the demo scenario for the visual language.
 * Every department gets reviews piling on its reviewers, its manager and the
 * boss (carried there by couriers), plus fresh platform work so many people
 * sit at their desks working on Shopee, Zalo and Facebook tasks.
 */

/** One review per entry, per department: who it lands on and how urgent. */
const REVIEW_PLAN: readonly { level: ApprovalLevel; priority: Priority }[] = [
  { level: 'reviewer', priority: 'urgent' },
  { level: 'reviewer', priority: 'normal' },
  { level: 'dept_manager', priority: 'high' },
  { level: 'dept_manager', priority: 'low' },
  { level: 'boss', priority: 'high' },
]

/** Platforms the demo wants to see as badges, in rotation. */
const DEMO_PLATFORMS = ['shopee', 'zalo_oa', 'facebook'] as const

const BACKLOG_PER_DEPARTMENT = 3

export function runBusyDayScenario(ctx: SimBrainContext): void {
  emitSimEvent(ctx, 'sim.scenario', {
    key: 'busy_day',
    label: { vi: 'Ngày bận rộn', en: 'Busy day' },
  })

  const departments = ctx.state.config.departments
    .filter((d) => d.active)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  let rotation = 0

  const platformFor = (platformKeys: readonly string[]): string | null => {
    for (let i = 0; i < DEMO_PLATFORMS.length; i += 1) {
      const key = DEMO_PLATFORMS[(rotation + i) % DEMO_PLATFORMS.length]!
      if (platformKeys.includes(key)) {
        rotation += 1
        return key
      }
    }
    return platformKeys.length > 0 ? pick(ctx.rng, platformKeys) : null
  }

  // Per department, one or two people are couriers today (their finished work
  // waits for review, so they take nothing new); everyone else gets fresh
  // platform work at the desk.
  for (const dept of departments) {
    const workers = departmentWorkers(ctx, dept.id)
    const taskTypes = ctx.state.config.taskTypes.filter(
      (t) => t.departmentKey === dept.key && !t.key.startsWith('sys.'),
    )
    if (workers.length === 0 || taskTypes.length === 0) continue
    const managerId = getDeptManagerEmployeeId(ctx, dept.id)
    const courierCount = workers.length >= 4 ? 2 : 1
    const couriers = workers.slice(0, courierCount)
    const deskWorkers = workers.slice(courierCount)

    // 1. Finished work goes up for review: couriers carry it to the approvers.
    REVIEW_PLAN.forEach((plan, i) => {
      const tt = pick(ctx.rng, taskTypes)
      const task = createTaskInBrain(ctx, tt.key, {
        requestedByKind: 'customer',
        priority: plan.priority,
        departmentId: dept.id,
        platformKey: platformFor(tt.platformKeys),
      })
      const courierId = couriers[i % couriers.length]!
      emitSimEvent(
        ctx,
        'task.assigned',
        { taskId: task.id, assigneeId: courierId, byId: managerId },
        { actor: managerId },
      )
      emitSimEvent(ctx, 'task.started', { taskId: task.id }, { actor: courierId })
      emitSimEvent(
        ctx,
        'task.progressed',
        { taskId: task.id, progress: 1 },
        { actor: courierId },
      )
      // Same path as the brain: the courier carries the paper and is back
      // to idle once it is handed in.
      const review = requestInitialReviewOrComplete(ctx, task.id, plan.level, courierId)
      if (!review) return
      ctx.reviewTimers.set(review.id, {
        startedSimMs: ctx.clock.nowMs(),
        durationSimMs: intRange(ctx.rng, 60, 120) * 60_000,
      })
    })

    // 2. Fresh platform work for everyone else, started straight away.
    for (const workerId of deskWorkers) {
      const specialties =
        ctx.state.config.employees.find((e) => e.id === workerId)?.specialties ?? []
      const matching = taskTypes.filter(
        (t) => t.platformKeys.length > 0 && specialties.includes(t.specialty),
      )
      if (matching.length === 0) continue
      const tt = pick(ctx.rng, matching)
      const task = createTaskInBrain(ctx, tt.key, {
        requestedByKind: 'customer',
        priority: 'high',
        departmentId: dept.id,
        platformKey: platformFor(tt.platformKeys),
      })
      emitSimEvent(
        ctx,
        'task.assigned',
        { taskId: task.id, assigneeId: workerId, byId: managerId },
        { actor: managerId },
      )
    }

    // 3. A backlog, so the queue keeps moving after the first tasks finish.
    const platformTypes = taskTypes.filter((t) => t.platformKeys.length > 0)
    for (let i = 0; i < BACKLOG_PER_DEPARTMENT && platformTypes.length > 0; i += 1) {
      const tt = pick(ctx.rng, platformTypes)
      createTaskInBrain(ctx, tt.key, {
        requestedByKind: 'customer',
        departmentId: dept.id,
        platformKey: platformFor(tt.platformKeys),
      })
    }
  }

  stepAssignments(ctx)
  stepWorkers(ctx, 60_000)
}

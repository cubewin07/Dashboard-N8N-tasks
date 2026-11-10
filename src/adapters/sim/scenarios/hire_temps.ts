import { planHire } from '@/domain/staffing'
import {
  decideReviewInBrain,
  hireTempEmployee,
  requestInitialReviewOrComplete,
} from '../brain/agents'
import {
  createTaskInBrain,
  emitSimEvent,
  getManagerEmployeeId,
  type SimBrainContext,
} from '../brain/context'

export function runHireTempsScenario(ctx: SimBrainContext): void {
  const nowIso = ctx.clock.now()
  const managerId = getManagerEmployeeId(ctx)
  emitSimEvent(ctx, 'sim.scenario', {
    key: 'hire_temps',
    label: {
      vi: 'Tuyển thêm người',
      en: 'Hire temporary staff',
    },
  })

  const cap = ctx.state.config.policy.staffing.tempCap
  const deptIds = ctx.state.config.departments.map((d) => d.id)

  let activeTemps = ctx.state.config.employees.filter(
    (e) => e.state === 'active' && e.kind === 'temp',
  ).length

  while (activeTemps < cap) {
    const deptId = deptIds[activeTemps % deptIds.length] ?? 'dep_cs'
    hireTempEmployee(ctx, deptId, 'manager')
    activeTemps += 1
  }

  // One over cap initiated by manager
  const plan = planHire({ requestedBy: 'manager' }, ctx.state, nowIso)
  if (plan.kind === 'hire_after_archive') {
    emitSimEvent(
      ctx,
      'staff.archived',
      { employeeId: plan.archiveId, reason: 'cap' },
      { actor: managerId },
    )
    hireTempEmployee(ctx, 'dep_cs', 'manager')
  } else {
    const overCapTask = createTaskInBrain(ctx, 'sys.hire_over_cap', {
      requestedByKind: 'manager',
      channel: 'internal',
      priority: 'high',
      departmentId: 'dep_cs',
      extraTags: ['hire_over_cap'],
      actor: managerId,
    })

    const rev1 = requestInitialReviewOrComplete(
      ctx,
      overCapTask.id,
      'reviewer',
      managerId,
    )
    if (rev1) {
      emitSimEvent(
        ctx,
        'review.started',
        { reviewId: rev1.id },
        { actor: rev1.assigneeId },
      )
      decideReviewInBrain(
        ctx,
        rev1,
        'approved',
        'Xác nhận hàng chờ CSKH đang vượt tải, chuyển Trưởng phòng.',
        rev1.assigneeId,
      )
    }

    const rev2 = Object.values(ctx.state.reviews).find(
      (r) =>
        r.taskId === overCapTask.id &&
        r.level === 'dept_manager' &&
        r.status === 'pending',
    )
    if (rev2) {
      emitSimEvent(
        ctx,
        'review.started',
        { reviewId: rev2.id },
        { actor: rev2.assigneeId },
      )
      decideReviewInBrain(
        ctx,
        rev2,
        'approved',
        'Trình Sếp duyệt tuyển thêm nhân viên tạm vượt trần.',
        rev2.assigneeId,
      )
    }
  }
}

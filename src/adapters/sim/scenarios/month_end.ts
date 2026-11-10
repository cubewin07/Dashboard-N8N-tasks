import {
  decideReviewInBrain,
  requestInitialReviewOrComplete,
  stepAssignments,
  stepWorkers,
} from '../brain/agents'
import {
  createTaskInBrain,
  emitSimEvent,
  getDeptManagerEmployeeId,
  type SimBrainContext,
} from '../brain/context'

export function runMonthEndScenario(ctx: SimBrainContext): void {
  ctx.forceMonthEnd = true
  emitSimEvent(ctx, 'sim.scenario', {
    key: 'month_end',
    label: {
      vi: 'Cuối tháng kế toán',
      en: 'Month-end accounting closing',
    },
  })

  const shops = [
    'Shopee 1',
    'Shopee 2',
    'Shopee 3',
    'Lazada 1',
    'TikTok Shop 1',
  ]
  for (const shop of shops) {
    createTaskInBrain(ctx, 'acc.reconcile', {
      requestedByKind: 'schedule',
      channel: 'schedule',
      priority: 'high',
      departmentId: 'dep_accounting',
      titleCtx: { shop, month: 11 },
    })
  }

  createTaskInBrain(ctx, 'acc.revenue_report', {
    requestedByKind: 'schedule',
    channel: 'schedule',
    priority: 'high',
    departmentId: 'dep_accounting',
    titleCtx: { month: 11 },
  })

  const vatTask = createTaskInBrain(ctx, 'acc.vat_return', {
    requestedByKind: 'schedule',
    channel: 'schedule',
    priority: 'urgent',
    departmentId: 'dep_accounting',
    titleCtx: { quarter: 4 },
  })

  // Advance tax item (acc.vat_return) through reviewer -> dept_manager -> boss queue
  const deptMgrId = getDeptManagerEmployeeId(ctx, 'dep_accounting')

  emitSimEvent(
    ctx,
    'task.assigned',
    {
      taskId: vatTask.id,
      assigneeId: 'emp_hanh',
      byId: deptMgrId,
    },
    { actor: deptMgrId },
  )
  emitSimEvent(
    ctx,
    'task.started',
    { taskId: vatTask.id },
    { actor: 'emp_hanh' },
  )
  emitSimEvent(
    ctx,
    'task.progressed',
    { taskId: vatTask.id, progress: 1 },
    { actor: 'emp_hanh' },
  )

  const rev1 = requestInitialReviewOrComplete(
    ctx,
    vatTask.id,
    'reviewer',
    'emp_hanh',
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
      'Đã đối chiếu bảng kê hoá đơn đầu vào và đầu ra quý 4.',
      rev1.assigneeId,
    )
  }

  const rev2 = Object.values(ctx.state.reviews).find(
    (r) =>
      r.taskId === vatTask.id &&
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
      'Số liệu tờ khai thuế GTGT quý 4 chính xác, trình Sếp ký duyệt nộp.',
      rev2.assigneeId,
    )
  }

  // Assign available accounting workers so the floor saturates
  stepAssignments(ctx)
  stepWorkers(ctx, 60_000)
}

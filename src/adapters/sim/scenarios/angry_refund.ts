import { pickApprover } from '@/domain/reviews'
import {
  decideReviewInBrain,
  requestInitialReviewOrComplete,
} from '../brain/agents'
import {
  createTaskInBrain,
  emitSimEvent,
  departmentIdByKey,
  departmentWorkers,
  getDeptManagerEmployeeId,
  type SimBrainContext,
} from '../brain/context'

export function runAngryRefundScenario(ctx: SimBrainContext): void {
  const csDept = departmentIdByKey(ctx, 'cs')
  const accountingDept = departmentIdByKey(ctx, 'accounting')
  emitSimEvent(ctx, 'sim.scenario', {
    key: 'angry_refund',
    label: {
      vi: 'Khách giận đòi hoàn tiền',
      en: 'Angry customer demanding refund',
    },
  })

  const refundTask = createTaskInBrain(ctx, 'cs.refund_request', {
    requestedByKind: 'customer',
    channel: 'platform',
    priority: 'urgent',
    departmentId: csDept,
    platformKey: 'shopee',
    amountVnd: 2_800_000,
    extraTags: ['refund', 'money', 'angry_customer'],
    titleCtx: {
      shop: 'Shopee 1',
    },
  })

  const workerId = departmentWorkers(ctx, csDept)[0]!
  const deptMgrId = getDeptManagerEmployeeId(ctx, csDept)
  const acctMgrId = getDeptManagerEmployeeId(ctx, accountingDept)

  emitSimEvent(
    ctx,
    'task.assigned',
    {
      taskId: refundTask.id,
      assigneeId: workerId,
      byId: deptMgrId,
    },
    { actor: deptMgrId },
  )
  emitSimEvent(
    ctx,
    'task.started',
    { taskId: refundTask.id },
    { actor: workerId },
  )

  const payoutTask = createTaskInBrain(ctx, 'acc.refund_payout', {
    requestedByKind: 'employee',
    requestedById: workerId,
    channel: 'internal',
    priority: 'urgent',
    departmentId: accountingDept,
    parentTaskId: refundTask.id,
    amountVnd: 2_800_000,
    crossDepartment: true,
    actor: workerId,
  })

  emitSimEvent(
    ctx,
    'task.handed_off',
    {
      taskId: refundTask.id,
      fromId: workerId,
      toId: acctMgrId,
      newTaskId: payoutTask.id,
    },
    { actor: workerId },
  )

  emitSimEvent(
    ctx,
    'task.progressed',
    { taskId: refundTask.id, progress: 1 },
    { actor: workerId },
  )

  // Step 1: Reviewer approves -> escalates to dept_manager -> approves -> escalates to boss
  const rev1 = requestInitialReviewOrComplete(
    ctx,
    refundTask.id,
    'reviewer',
    workerId,
  )
  if (rev1) {
    const reviewerId =
      pickApprover('reviewer', refundTask, ctx.state) ?? rev1.assigneeId
    emitSimEvent(
      ctx,
      'review.started',
      { reviewId: rev1.id },
      { actor: reviewerId },
    )
    decideReviewInBrain(
      ctx,
      rev1,
      'approved',
      'Đã kiểm tra video mở hộp và mã vận đơn hợp lệ, chuyển Trưởng phòng.',
      reviewerId,
    )
  }

  const rev2 = Object.values(ctx.state.reviews).find(
    (r) =>
      r.taskId === refundTask.id &&
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
      'Đồng ý phương án hoàn tiền nhanh để tránh đánh giá 1 sao, trình Sếp phê duyệt cuối.',
      rev2.assigneeId,
    )
  }
}

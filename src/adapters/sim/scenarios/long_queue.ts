import { isInPerson } from '@/domain/questions'
import { pickLeadForDepartment } from '@/domain/reviews'
import type { Question, ReviewItem } from '@/domain/work'
import { QUESTIONS_VI } from '../content/vi'
import { pick, simId } from '../rng'
import {
  createTaskInBrain,
  departmentIdByKey,
  departmentWorkers,
  emitSimEvent,
  getDeptManagerEmployeeId,
  type SimBrainContext,
} from '../brain/context'

export function runLongQueueScenario(ctx: SimBrainContext): void {
  const nowMs = ctx.clock.nowMs()
  const nowIso = ctx.clock.now()
  emitSimEvent(ctx, 'sim.scenario', {
    key: 'long_queue',
    label: {
      vi: 'Hàng chờ duyệt dài',
      en: 'Long approval queue',
    },
  })

  const csDept = departmentIdByKey(ctx, 'cs')
  const targetMgrId = getDeptManagerEmployeeId(ctx, csDept)
  const workers = departmentWorkers(ctx, csDept)
  const submitterId = workers[0]!
  const courierId = pickLeadForDepartment(csDept, ctx.state) ?? targetMgrId

  // 1. Create 12 reviews onto targetMgrId
  for (let i = 0; i < 12; i += 1) {
    const priority = i < 3 ? 'urgent' : i < 7 ? 'high' : 'normal'
    const task = createTaskInBrain(ctx, 'cs.chat_order_status', {
      requestedByKind: 'customer',
      channel: 'platform',
      priority,
      departmentId: csDept,
    })
    emitSimEvent(
      ctx,
      'task.assigned',
      {
        taskId: task.id,
        assigneeId: submitterId,
        byId: targetMgrId,
      },
      { actor: targetMgrId },
    )
    emitSimEvent(
      ctx,
      'task.started',
      { taskId: task.id },
      { actor: submitterId },
    )
    emitSimEvent(
      ctx,
      'task.progressed',
      { taskId: task.id, progress: 1 },
      { actor: submitterId },
    )

    const rev: ReviewItem = {
      id: simId('rev', ctx.rng, nowMs + i),
      taskId: task.id,
      level: 'dept_manager',
      assigneeId: targetMgrId,
      status: 'pending',
      priority,
      createdAt: nowIso,
      decidedAt: null,
      decidedBy: null,
      note: null,
    }
    emitSimEvent(
      ctx,
      'review.requested',
      { review: rev },
      { actor: courierId },
    )
    ctx.reviewTimers.set(rev.id, {
      startedSimMs: nowMs,
      durationSimMs: 60 * 60_000,
    })
  }

  // 2. Ask the Marketing manager enough questions that 5 askers end up
  // sitting on the bench outside their office (P05 demo: "Hàng chờ dài").
  // R8: a question is in person only once the target already has
  // `questionSeatThreshold` open ones, so the first few are walk-ups.
  const mktDept = departmentIdByKey(ctx, 'marketing')
  const questionTargetId = getDeptManagerEmployeeId(ctx, mktDept)
  const seatsWanted = 5
  const walkUps = ctx.state.config.policy.approvals.questionSeatThreshold
  // Marketing staff first, then people from other floors, each on a task of
  // their own department.
  const needed = walkUps + seatsWanted
  const askers = [
    ...departmentWorkers(ctx, mktDept),
    ...ctx.state.config.departments
      .filter((d) => d.active && d.id !== mktDept)
      .flatMap((d) => departmentWorkers(ctx, d.id)),
  ]
    .filter((id) => id !== questionTargetId)
    .slice(0, needed)
  for (let i = 0; i < askers.length; i += 1) {
    const askerId = askers[i]!
    const askerDept =
      ctx.state.config.employees.find((e) => e.id === askerId)?.departmentId ??
      csDept
    const askerDeptKey = ctx.state.config.departments.find(
      (d) => d.id === askerDept,
    )?.key
    const askerTaskType =
      ctx.state.config.taskTypes.find(
        (t) => t.departmentKey === askerDeptKey && !t.key.startsWith('sys.'),
      )?.key ?? 'cs.exchange'
    const askerManagerId = getDeptManagerEmployeeId(ctx, askerDept)
    const qTask = createTaskInBrain(ctx, askerTaskType, {
      requestedByKind: askerDept === csDept ? 'customer' : 'manager',
      channel: askerDept === csDept ? 'platform' : 'internal',
      priority: 'high',
      departmentId: askerDept,
    })
    emitSimEvent(
      ctx,
      'task.assigned',
      {
        taskId: qTask.id,
        assigneeId: askerId,
        byId: askerManagerId,
      },
      { actor: askerManagerId },
    )
    emitSimEvent(
      ctx,
      'task.started',
      { taskId: qTask.id },
      { actor: askerId },
    )

    const qa =
      QUESTIONS_VI[i % QUESTIONS_VI.length] ?? pick(ctx.rng, QUESTIONS_VI)
    const computedInPerson = isInPerson(
      questionTargetId,
      ctx.state,
      ctx.state.config.policy,
    )
    const q: Question = {
      id: simId('q', ctx.rng, nowMs + 100 + i),
      taskId: qTask.id,
      fromId: askerId,
      toId: questionTargetId,
      text: qa.question,
      status: 'open',
      inPerson: computedInPerson,
      createdAt: nowIso,
      answeredAt: null,
    }
    emitSimEvent(
      ctx,
      'question.asked',
      { question: q },
      { actor: askerId },
    )
    ctx.questionTimers.set(q.id, {
      askedSimMs: nowMs,
      answerDurationSimMs: 60 * 60_000,
      isBossTarget: false,
    })
  }
}

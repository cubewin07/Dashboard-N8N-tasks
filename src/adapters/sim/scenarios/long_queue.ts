import { isInPerson } from '@/domain/questions'
import type { Question, ReviewItem } from '@/domain/work'
import { QUESTIONS_VI } from '../content/vi'
import { pick, simId } from '../rng'
import {
  createTaskInBrain,
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

  const targetMgrId = getDeptManagerEmployeeId(ctx, 'dep_cs') // emp_ngoc

  // 1. Create 12 reviews onto targetMgrId
  for (let i = 0; i < 12; i += 1) {
    const priority = i < 3 ? 'urgent' : i < 7 ? 'high' : 'normal'
    const task = createTaskInBrain(ctx, 'cs.chat_order_status', {
      requestedByKind: 'customer',
      channel: 'platform',
      priority,
      departmentId: 'dep_cs',
    })
    emitSimEvent(
      ctx,
      'task.assigned',
      {
        taskId: task.id,
        assigneeId: 'emp_mai',
        byId: targetMgrId,
      },
      { actor: targetMgrId },
    )
    emitSimEvent(
      ctx,
      'task.started',
      { taskId: task.id },
      { actor: 'emp_mai' },
    )
    emitSimEvent(
      ctx,
      'task.progressed',
      { taskId: task.id, progress: 1 },
      { actor: 'emp_mai' },
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
      { actor: 'emp_linh' },
    )
    ctx.reviewTimers.set(rev.id, {
      startedSimMs: nowMs,
      durationSimMs: 60 * 60_000,
    })
  }

  // 2. Create 5 open questions onto targetMgrId from 5 distinct people so 5 people are waiting_answer in person
  const askers = [
    'emp_mai',
    'emp_trang',
    'emp_phuc',
    'emp_an',
    'emp_quan',
  ] as const
  for (let i = 0; i < askers.length; i += 1) {
    const askerId = askers[i]!
    const qTask = createTaskInBrain(ctx, 'cs.exchange', {
      requestedByKind: 'customer',
      channel: 'platform',
      priority: 'high',
      departmentId: 'dep_cs',
    })
    emitSimEvent(
      ctx,
      'task.assigned',
      {
        taskId: qTask.id,
        assigneeId: askerId,
        byId: targetMgrId,
      },
      { actor: targetMgrId },
    )
    emitSimEvent(
      ctx,
      'task.started',
      { taskId: qTask.id },
      { actor: askerId },
    )

    const qa =
      QUESTIONS_VI[i % QUESTIONS_VI.length] ?? pick(ctx.rng, QUESTIONS_VI)
    const computedInPerson =
      isInPerson(targetMgrId, ctx.state, ctx.state.config.policy) || true
    const q: Question = {
      id: simId('q', ctx.rng, nowMs + 100 + i),
      taskId: qTask.id,
      fromId: askerId,
      toId: targetMgrId,
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

import { parseCommand, type Command, type CommandAck } from '@/domain/commands'
import type { CommandId } from '@/domain/primitives'
import { isInPerson } from '@/domain/questions'
import { planHire } from '@/domain/staffing'
import type { Question, Task } from '@/domain/work'
import { simId } from '../rng'
import { decideReviewInBrain, hireTempEmployee } from './agents'
import { routeClarifiedIntake } from './clarify'
import {
  createTaskInBrain,
  emitSimEvent,
  getManagerEmployeeId,
  getPrimaryOwnerEmployeeId,
  type SimBrainContext,
} from './context'
import { parseIntakeDetails } from './intakeParser'

export function handleSimCommand(
  ctx: SimBrainContext,
  rawCmd: Command,
): CommandAck {
  const parsed = parseCommand(rawCmd)
  if (!parsed.ok) {
    const rawId = ((rawCmd as { id?: string })?.id ?? 'cmd_invalid') as CommandId
    return {
      commandId: rawId,
      status: 'rejected',
      reason: 'invalid_state',
    }
  }

  const cmd = parsed.command

  // Idempotency by command.id
  const existingAck = ctx.processedCommands.get(cmd.id)
  if (existingAck) {
    return existingAck
  }

  // Checks that do not depend on timing run first, so a bad command is
  // refused now instead of "accepted" and silently dropped when it runs.
  const refusal = validateCommand(ctx, cmd)
  if (refusal) {
    ctx.processedCommands.set(cmd.id, refusal)
    return refusal
  }

  if (!ctx.teamOnline) {
    ctx.queuedOfflineCommands.push(cmd)
    const ack: CommandAck = { commandId: cmd.id, status: 'accepted' }
    ctx.processedCommands.set(cmd.id, ack)
    return ack
  }

  const ack = executeCommandNow(ctx, cmd)
  ctx.processedCommands.set(cmd.id, ack)
  return ack
}

function departmentIdForManagerTask(ctx: SimBrainContext) {
  const dept =
    ctx.state.config.departments.find((d) => d.active) ??
    ctx.state.config.departments[0]
  if (!dept) throw new Error('No department in config')
  return dept.id
}

function validateCommand(ctx: SimBrainContext, cmd: Command): CommandAck | null {
  // contracts.md §3: every command is boss-only (stylists touch appearance only).
  if (cmd.issuedBy.role !== 'boss') {
    return { commandId: cmd.id, status: 'rejected', reason: 'forbidden' }
  }
  if (cmd.type === 'staff.hire') {
    const { departmentId, roleKey } = cmd.payload
    if (!ctx.state.config.departments.some((d) => d.id === departmentId && d.active)) {
      return { commandId: cmd.id, status: 'rejected', reason: 'not_found' }
    }
    const role = ctx.state.config.roles.find((r) => r.key === roleKey)
    if (!role) {
      return { commandId: cmd.id, status: 'rejected', reason: 'not_found' }
    }
    // Temps do the work or review it; owner, manager and dept_manager seats are not for hire.
    const hireable = role.caps.doWork || role.caps.approveLevel === 'reviewer'
    if (role.caps.humanOwner || !hireable) {
      return { commandId: cmd.id, status: 'rejected', reason: 'invalid_state' }
    }
  }
  return null
}

export function flushOfflineCommands(ctx: SimBrainContext): void {
  if (!ctx.teamOnline || ctx.queuedOfflineCommands.length === 0) return
  const queue = ctx.queuedOfflineCommands.splice(
    0,
    ctx.queuedOfflineCommands.length,
  )
  for (const cmd of queue) {
    executeCommandNow(ctx, cmd)
  }
}

function executeCommandNow(ctx: SimBrainContext, cmd: Command): CommandAck {
  const ownerId = getPrimaryOwnerEmployeeId(ctx)
  const managerId = getManagerEmployeeId(ctx)
  const nowMs = ctx.clock.nowMs()

  switch (cmd.type) {
    case 'review.decide': {
      const review = ctx.state.reviews[cmd.payload.reviewId]
      if (!review) {
        return {
          commandId: cmd.id,
          status: 'rejected',
          reason: 'not_found',
        }
      }
      if (
        review.status === 'approved' ||
        review.status === 'changes_requested' ||
        review.status === 'rejected'
      ) {
        return {
          commandId: cmd.id,
          status: 'rejected',
          reason: 'already_decided',
        }
      }
      if (
        cmd.payload.decision === 'changes_requested' &&
        (!cmd.payload.note || cmd.payload.note.trim().length === 0)
      ) {
        return {
          commandId: cmd.id,
          status: 'rejected',
          reason: 'invalid_state',
        }
      }
      const actorId =
        review.level === 'boss' ? ownerId : review.assigneeId
      decideReviewInBrain(
        ctx,
        review,
        cmd.payload.decision,
        cmd.payload.note,
        actorId,
        cmd.id,
      )
      return { commandId: cmd.id, status: 'accepted' }
    }

    case 'question.answer': {
      const question = ctx.state.questions[cmd.payload.questionId]
      if (!question) {
        return {
          commandId: cmd.id,
          status: 'rejected',
          reason: 'not_found',
        }
      }
      if (question.status === 'answered') {
        return {
          commandId: cmd.id,
          status: 'rejected',
          reason: 'already_decided',
        }
      }

      emitSimEvent(
        ctx,
        'question.answered',
        {
          questionId: question.id,
          answer: cmd.payload.answer,
        },
        { actor: question.toId, causedBy: cmd.id },
      )
      routeClarifiedIntake(ctx, question, cmd.payload.answer, cmd.id)
      return { commandId: cmd.id, status: 'accepted' }
    }

    case 'intake.submit': {
      const messageId = simId('msg', ctx.rng, nowMs)
      emitSimEvent(
        ctx,
        'intake.received',
        {
          messageId,
          channel: 'app',
          modality: cmd.payload.modality,
          fromUserId: cmd.issuedBy.userId,
          text: cmd.payload.text,
        },
        { actor: ownerId, causedBy: cmd.id },
      )

      const details = parseIntakeDetails(cmd.payload.text)
      if (details.matched) {
        for (const typeKey of details.typeKeys) {
          createTaskInBrain(ctx, typeKey, {
            requestedByKind: 'boss',
            requestedById: ownerId,
            channel: 'app',
            priority: details.priority,
            platformKey: details.platformKey,
            titleCtx: {
              shop: details.shop,
              event: details.event,
            },
            actor: managerId,
            causedBy: messageId,
          })
        }
      } else {
        // Unmatched intake: Manager creates a Clarification task and asks the Boss
        const pendingTask: Task = {
          id: simId('task', ctx.rng, nowMs),
          typeKey: 'cs.chat_faq',
          title: `Yêu cầu từ Sếp: "${cmd.payload.text.slice(0, 60)}"`,
          detail: cmd.payload.text,
          // The manager owns the clarification; file it on their department
          // (the manager has none, so the first active one).
          departmentId: departmentIdForManagerTask(ctx),
          assigneeId: managerId,
          requestedBy: {
            kind: 'boss',
            id: ownerId,
          },
          channel: 'app',
          platformKey: null,
          shopId: null,
          amountVnd: null,
          tags: ['internal_note'],
          priority: details.priority ?? 'high',
          createdAt: ctx.clock.now(),
          startedAt: null,
          finishedAt: null,
          status: 'queued',
          progress: 0,
          requiredLevel: 'dept_manager',
          matchedRuleIds: [],
          parentTaskId: null,
          attempts: 0,
        }
        emitSimEvent(
          ctx,
          'task.created',
          { task: pendingTask },
          { actor: managerId, causedBy: cmd.id },
        )

        const inPerson = isInPerson(
          ownerId,
          ctx.state,
          ctx.state.config.policy,
        )
        const q: Question = {
          id: simId('q', ctx.rng, nowMs),
          taskId: pendingTask.id,
          fromId: managerId,
          toId: ownerId,
          text: 'Sếp muốn giao việc này cho phòng nào?',
          status: 'open',
          inPerson,
          createdAt: ctx.clock.now(),
          answeredAt: null,
        }
        emitSimEvent(
          ctx,
          'question.asked',
          { question: q },
          { actor: managerId, causedBy: cmd.id },
        )
        ctx.questionTimers.set(q.id, {
          askedSimMs: nowMs,
          answerDurationSimMs: 5 * 60_000,
          isBossTarget: true,
          pendingIntakeText: cmd.payload.text,
          pendingIntakeMessageId: messageId,
        })
      }

      return { commandId: cmd.id, status: 'accepted' }
    }

    case 'task.set_priority': {
      const task = ctx.state.tasks[cmd.payload.taskId]
      if (!task) {
        return {
          commandId: cmd.id,
          status: 'rejected',
          reason: 'not_found',
        }
      }
      emitSimEvent(
        ctx,
        'task.reprioritised',
        {
          taskId: task.id,
          priority: cmd.payload.priority,
        },
        { actor: ownerId, causedBy: cmd.id },
      )
      return { commandId: cmd.id, status: 'accepted' }
    }

    case 'task.cancel': {
      const task = ctx.state.tasks[cmd.payload.taskId]
      if (!task) {
        return {
          commandId: cmd.id,
          status: 'rejected',
          reason: 'not_found',
        }
      }
      if (task.status === 'done' || task.status === 'cancelled') {
        return {
          commandId: cmd.id,
          status: 'rejected',
          reason: 'invalid_state',
        }
      }
      emitSimEvent(
        ctx,
        'task.cancelled',
        {
          taskId: task.id,
          reason: cmd.payload.reason ?? 'Sếp yêu cầu huỷ việc',
        },
        { actor: ownerId, causedBy: cmd.id },
      )
      return { commandId: cmd.id, status: 'accepted' }
    }

    case 'staff.hire': {
      const plan = planHire(
        {
          requestedBy: 'boss',
          departmentId: cmd.payload.departmentId,
          roleKey: cmd.payload.roleKey,
          specialties: cmd.payload.specialties,
        },
        ctx.state,
        ctx.clock.now(),
      )
      if (plan.kind === 'hire_after_archive') {
        emitSimEvent(
          ctx,
          'staff.archived',
          {
            employeeId: plan.archiveId,
            reason: 'cap',
          },
          { actor: ownerId, causedBy: cmd.id },
        )
      }
      hireTempEmployee(
        ctx,
        cmd.payload.departmentId,
        'boss',
        cmd.payload.specialties,
        cmd.id,
        cmd.payload.name,
        cmd.payload.roleKey,
      )
      return { commandId: cmd.id, status: 'accepted' }
    }

    case 'staff.dismiss': {
      const emp = ctx.state.config.employees.find(
        (e) => e.id === cmd.payload.employeeId,
      )
      if (!emp) {
        return {
          commandId: cmd.id,
          status: 'rejected',
          reason: 'not_found',
        }
      }
      if (emp.kind === 'core' || emp.state === 'archived') {
        return {
          commandId: cmd.id,
          status: 'rejected',
          reason: 'invalid_state',
        }
      }
      emitSimEvent(
        ctx,
        'staff.archived',
        {
          employeeId: emp.id,
          reason: 'dismissed',
        },
        { actor: ownerId, causedBy: cmd.id },
      )
      return { commandId: cmd.id, status: 'accepted' }
    }
  }
}

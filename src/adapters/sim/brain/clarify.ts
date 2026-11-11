import type { Department } from '@/domain/config'
import type { Question } from '@/domain/work'
import {
  createTaskInBrain,
  emitSimEvent,
  getManagerEmployeeId,
  getPrimaryOwnerEmployeeId,
  type SimBrainContext,
} from './context'
import { parseIntakeDetails, stripDiacritics } from './intakeParser'

function departmentNamedIn(
  answer: string,
  departments: readonly Department[],
): Department | undefined {
  const norm = stripDiacritics(answer).toLowerCase()
  return departments.find(
    (d) =>
      d.active &&
      (norm.includes(stripDiacritics(d.label.vi).toLowerCase()) ||
        norm.includes(d.key.toLowerCase())),
  )
}

/**
 * The boss answered "which department should take this?". Turn the answer
 * into real work: read it together with the original request, or fall back
 * to the department it names, and replace the placeholder clarification task.
 * Does nothing when the answer points nowhere (the manager keeps the task).
 */
export function routeClarifiedIntake(
  ctx: SimBrainContext,
  question: Question,
  answer: string,
  causedBy?: string,
): void {
  const timer = ctx.questionTimers.get(question.id)
  const text = timer?.pendingIntakeText
  if (!text) return

  const details = parseIntakeDetails(`${text}. ${answer}`)
  let typeKeys = details.typeKeys
  let departmentId: Department['id'] | undefined

  if (typeKeys.length === 0) {
    const dept = departmentNamedIn(answer, ctx.state.config.departments)
    const type = dept
      ? ctx.state.config.taskTypes.find(
          (t) => t.departmentKey === dept.key && !t.key.startsWith('sys.'),
        )
      : undefined
    if (!dept || !type) return
    typeKeys = [type.key]
    departmentId = dept.id
  }

  const placeholder = ctx.state.tasks[question.taskId]
  if (
    placeholder &&
    placeholder.status !== 'done' &&
    placeholder.status !== 'cancelled'
  ) {
    emitSimEvent(
      ctx,
      'task.cancelled',
      {
        taskId: placeholder.id,
        reason: 'Đã giao việc theo chỉ đạo của Sếp.',
      },
      { actor: getManagerEmployeeId(ctx), causedBy },
    )
  }

  for (const typeKey of typeKeys) {
    createTaskInBrain(ctx, typeKey, {
      requestedByKind: 'boss',
      requestedById: getPrimaryOwnerEmployeeId(ctx),
      channel: 'app',
      priority: details.priority,
      platformKey: details.platformKey,
      departmentId,
      title: departmentId ? `Yêu cầu từ Sếp: "${text.slice(0, 60)}"` : undefined,
      detail: departmentId ? text : undefined,
      titleCtx: { shop: details.shop, event: details.event },
      actor: getManagerEmployeeId(ctx),
      causedBy: timer?.pendingIntakeMessageId ?? causedBy,
    })
  }
}

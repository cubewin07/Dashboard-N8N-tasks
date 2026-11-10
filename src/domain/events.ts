import { z } from 'zod'
import { AppearanceV1Schema, type AppearanceV1 } from './appearance'
import {
  ConfigChangeSchema,
  EmployeeSchema,
  type ConfigChange,
  type Employee,
} from './config'
import {
  ApprovalLevelSchema,
  EmployeeIdSchema,
  EventIdSchema,
  HelpIdSchema,
  IsoSchema,
  LabelSchema,
  MessageIdSchema,
  PrioritySchema,
  QuestionIdSchema,
  ReviewIdSchema,
  TaskIdSchema,
  type ApprovalLevel,
  type EmployeeId,
  type EventId,
  type HelpId,
  type Iso,
  type Label,
  type MessageId,
  type Priority,
  type QuestionId,
  type ReviewId,
  type TaskId,
} from './primitives'
import {
  HelpRequestSchema,
  PersonActivitySchema,
  PersonLocationHintSchema,
  QuestionSchema,
  ReviewDecisionSchema,
  ReviewItemSchema,
  TaskSchema,
  type HelpRequest,
  type PersonActivity,
  type PersonLocationHint,
  type Question,
  type ReviewDecision,
  type ReviewItem,
  type Task,
} from './work'

export const EVENT_TYPES = [
  'intake.received',
  'task.created',
  'task.assigned',
  'task.started',
  'task.progressed',
  'task.handed_off',
  'task.reprioritised',
  'task.blocked',
  'task.completed',
  'task.cancelled',
  'task.failed',
  'review.requested',
  'review.started',
  'review.decided',
  'review.escalated',
  'question.asked',
  'question.answered',
  'help.requested',
  'help.accepted',
  'help.answered',
  'help.timed_out',
  'help.escalated',
  'person.activity',
  'staff.hired',
  'staff.archived',
  'config.changed',
  'system.heartbeat',
  'sim.scenario',
] as const

export type EventType = (typeof EVENT_TYPES)[number]
export const EventTypeSchema = z.enum(EVENT_TYPES)

export interface EventPayloads {
  'intake.received': {
    messageId: MessageId
    channel: 'telegram' | 'app'
    modality: 'text' | 'voice'
    fromUserId: string
    text: string
  }
  'task.created': {
    task: Task
  }
  'task.assigned': {
    taskId: TaskId
    assigneeId: EmployeeId
    byId: string
  }
  'task.started': {
    taskId: TaskId
  }
  'task.progressed': {
    taskId: TaskId
    progress: number
  }
  'task.handed_off': {
    taskId: TaskId
    fromId: EmployeeId
    toId: EmployeeId
    newTaskId?: TaskId
  }
  'task.reprioritised': {
    taskId: TaskId
    priority: Priority
  }
  'task.blocked': {
    taskId: TaskId
    reason: string
  }
  'task.completed': {
    taskId: TaskId
  }
  'task.cancelled': {
    taskId: TaskId
    reason: string
  }
  'task.failed': {
    taskId: TaskId
    reason: string
  }
  'review.requested': {
    review: ReviewItem
  }
  'review.started': {
    reviewId: ReviewId
  }
  'review.decided': {
    reviewId: ReviewId
    decision: ReviewDecision
    note?: string
  }
  'review.escalated': {
    reviewId: ReviewId
    toLevel: ApprovalLevel
    newReview: ReviewItem
  }
  'question.asked': {
    question: Question
  }
  'question.answered': {
    questionId: QuestionId
    answer: string
  }
  'help.requested': {
    help: HelpRequest
  }
  'help.accepted': {
    helpId: HelpId
    byId: EmployeeId
  }
  'help.answered': {
    helpId: HelpId
    byId: EmployeeId
  }
  'help.timed_out': {
    helpId: HelpId
    toId: EmployeeId
  }
  'help.escalated': {
    helpId: HelpId
    toId: EmployeeId
  }
  'person.activity': {
    employeeId: EmployeeId
    activity: PersonActivity
    locationHint?: PersonLocationHint
  }
  'staff.hired': {
    employee: Employee
    appearance?: AppearanceV1
  }
  'staff.archived': {
    employeeId: EmployeeId
    reason: 'cap' | 'dismissed'
  }
  'config.changed': {
    change: ConfigChange
  }
  'system.heartbeat': {
    source: 'sim' | 'worker'
    version: string
  }
  'sim.scenario': {
    key: string
    label: Label
  }
}

export const EVENT_PAYLOAD_SCHEMAS: {
  [K in EventType]: z.ZodType<EventPayloads[K]>
} = {
  'intake.received': z
    .object({
      messageId: MessageIdSchema,
      channel: z.enum(['telegram', 'app']),
      modality: z.enum(['text', 'voice']),
      fromUserId: z.string().min(1),
      text: z.string().min(1),
    })
    .passthrough(),
  'task.created': z
    .object({
      task: TaskSchema.refine((t) => t.status === 'queued', {
        message: 'task.created requires task.status === "queued"',
      }),
    })
    .passthrough(),
  'task.assigned': z
    .object({
      taskId: TaskIdSchema,
      assigneeId: EmployeeIdSchema,
      byId: z.string().min(1),
    })
    .passthrough(),
  'task.started': z
    .object({
      taskId: TaskIdSchema,
    })
    .passthrough(),
  'task.progressed': z
    .object({
      taskId: TaskIdSchema,
      progress: z.number().min(0).max(1),
    })
    .passthrough(),
  'task.handed_off': z
    .object({
      taskId: TaskIdSchema,
      fromId: EmployeeIdSchema,
      toId: EmployeeIdSchema,
      newTaskId: TaskIdSchema.optional(),
    })
    .passthrough(),
  'task.reprioritised': z
    .object({
      taskId: TaskIdSchema,
      priority: PrioritySchema,
    })
    .passthrough(),
  'task.blocked': z
    .object({
      taskId: TaskIdSchema,
      reason: z.string().min(1),
    })
    .passthrough(),
  'task.completed': z
    .object({
      taskId: TaskIdSchema,
    })
    .passthrough(),
  'task.cancelled': z
    .object({
      taskId: TaskIdSchema,
      reason: z.string().min(1),
    })
    .passthrough(),
  'task.failed': z
    .object({
      taskId: TaskIdSchema,
      reason: z.string().min(1),
    })
    .passthrough(),
  'review.requested': z
    .object({
      review: ReviewItemSchema,
    })
    .passthrough(),
  'review.started': z
    .object({
      reviewId: ReviewIdSchema,
    })
    .passthrough(),
  'review.decided': z
    .object({
      reviewId: ReviewIdSchema,
      decision: ReviewDecisionSchema,
      note: z.string().optional(),
    })
    .passthrough(),
  'review.escalated': z
    .object({
      reviewId: ReviewIdSchema,
      toLevel: ApprovalLevelSchema,
      newReview: ReviewItemSchema,
    })
    .passthrough(),
  'question.asked': z
    .object({
      question: QuestionSchema,
    })
    .passthrough(),
  'question.answered': z
    .object({
      questionId: QuestionIdSchema,
      answer: z.string().min(1),
    })
    .passthrough(),
  'help.requested': z
    .object({
      help: HelpRequestSchema,
    })
    .passthrough(),
  'help.accepted': z
    .object({
      helpId: HelpIdSchema,
      byId: EmployeeIdSchema,
    })
    .passthrough(),
  'help.answered': z
    .object({
      helpId: HelpIdSchema,
      byId: EmployeeIdSchema,
    })
    .passthrough(),
  'help.timed_out': z
    .object({
      helpId: HelpIdSchema,
      toId: EmployeeIdSchema,
    })
    .passthrough(),
  'help.escalated': z
    .object({
      helpId: HelpIdSchema,
      toId: EmployeeIdSchema,
    })
    .passthrough(),
  'person.activity': z
    .object({
      employeeId: EmployeeIdSchema,
      activity: PersonActivitySchema,
      locationHint: PersonLocationHintSchema.optional(),
    })
    .passthrough(),
  'staff.hired': z
    .object({
      employee: EmployeeSchema,
      appearance: AppearanceV1Schema.optional(),
    })
    .passthrough(),
  'staff.archived': z
    .object({
      employeeId: EmployeeIdSchema,
      reason: z.enum(['cap', 'dismissed']),
    })
    .passthrough(),
  'config.changed': z
    .object({
      change: ConfigChangeSchema,
    })
    .passthrough(),
  'system.heartbeat': z
    .object({
      source: z.enum(['sim', 'worker']),
      version: z.string().min(1),
    })
    .passthrough(),
  'sim.scenario': z
    .object({
      key: z.string().min(1),
      label: LabelSchema,
    })
    .passthrough(),
}

export interface EventActor {
  kind: 'employee' | 'owner' | 'system' | 'customer'
  id: string | null
}

export const EventActorSchema = z.object({
  kind: z.enum(['employee', 'owner', 'system', 'customer']),
  id: z.string().nullable(),
})

export interface OfficeEvent<T extends EventType = EventType> {
  v: 1
  id: EventId
  seq: number
  at: Iso
  type: T
  actor: EventActor
  causedBy: string | null
  payload: EventPayloads[T]
}

export const OfficeEventEnvelopeSchema = z
  .object({
    v: z.literal(1),
    id: EventIdSchema,
    seq: z.number().int().positive(),
    at: IsoSchema,
    type: z.string().min(1),
    actor: EventActorSchema,
    causedBy: z.string().nullable(),
    payload: z.unknown(),
  })
  .passthrough()

export type ParseEventResult =
  | { ok: true; event: OfficeEvent }
  | { ok: false; reason: string }

export function parseEvent(raw: unknown): ParseEventResult {
  const env = OfficeEventEnvelopeSchema.safeParse(raw)
  if (!env.success) {
    return {
      ok: false,
      reason: env.error.issues.map((i) => `${i.path.join('.') || 'envelope'}: ${i.message}`).join('; '),
    }
  }
  const typeCheck = EventTypeSchema.safeParse(env.data.type)
  if (!typeCheck.success) {
    return {
      ok: false,
      reason: `unknown_event_type: ${env.data.type}`,
    }
  }
  const eventType = typeCheck.data
  const payloadSchema = EVENT_PAYLOAD_SCHEMAS[eventType]
  const payloadRes = payloadSchema.safeParse(env.data.payload)
  if (!payloadRes.success) {
    return {
      ok: false,
      reason: payloadRes.error.issues
        .map((i) => `payload.${i.path.join('.')}: ${i.message}`)
        .join('; '),
    }
  }
  return {
    ok: true,
    event: {
      v: 1,
      id: env.data.id,
      seq: env.data.seq,
      at: env.data.at,
      type: eventType,
      actor: env.data.actor,
      causedBy: env.data.causedBy,
      payload: payloadRes.data,
    } as OfficeEvent,
  }
}

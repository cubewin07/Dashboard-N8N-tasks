import { z } from 'zod'
import {
  CommandIdSchema,
  DepartmentIdSchema,
  EmployeeIdSchema,
  IsoSchema,
  PrioritySchema,
  QuestionIdSchema,
  ReviewIdSchema,
  TaskIdSchema,
  type CommandId,
  type DepartmentId,
  type EmployeeId,
  type Iso,
  type Priority,
  type QuestionId,
  type ReviewId,
  type TaskId,
} from './primitives'
import { ReviewDecisionSchema, type ReviewDecision } from './work'

export const COMMAND_TYPES = [
  'intake.submit',
  'review.decide',
  'question.answer',
  'task.set_priority',
  'task.cancel',
  'staff.hire',
  'staff.dismiss',
] as const

export type CommandType = (typeof COMMAND_TYPES)[number]
export const CommandTypeSchema = z.enum(COMMAND_TYPES)

export interface CommandPayloads {
  'intake.submit': {
    text: string
    modality: 'text'
  }
  'review.decide': {
    reviewId: ReviewId
    decision: ReviewDecision
    note?: string
  }
  'question.answer': {
    questionId: QuestionId
    answer: string
  }
  'task.set_priority': {
    taskId: TaskId
    priority: Priority
  }
  'task.cancel': {
    taskId: TaskId
    reason?: string
  }
  'staff.hire': {
    departmentId: DepartmentId
    roleKey: string
    specialties: string[]
    name?: string
  }
  'staff.dismiss': {
    employeeId: EmployeeId
  }
}

export const COMMAND_PAYLOAD_SCHEMAS: {
  [K in CommandType]: z.ZodType<CommandPayloads[K]>
} = {
  'intake.submit': z
    .object({
      text: z.string().min(1),
      modality: z.literal('text'),
    })
    .strict(),
  'review.decide': z
    .object({
      reviewId: ReviewIdSchema,
      decision: ReviewDecisionSchema,
      note: z.string().optional(),
    })
    .strict(),
  'question.answer': z
    .object({
      questionId: QuestionIdSchema,
      answer: z.string().min(1),
    })
    .strict(),
  'task.set_priority': z
    .object({
      taskId: TaskIdSchema,
      priority: PrioritySchema,
    })
    .strict(),
  'task.cancel': z
    .object({
      taskId: TaskIdSchema,
      reason: z.string().optional(),
    })
    .strict(),
  'staff.hire': z
    .object({
      departmentId: DepartmentIdSchema,
      roleKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
      specialties: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)),
      name: z.string().min(1).optional(),
    })
    .strict(),
  'staff.dismiss': z
    .object({
      employeeId: EmployeeIdSchema,
    })
    .strict(),
}

export interface CommandIssuer {
  userId: string
  role: 'boss' | 'stylist'
}

export const CommandIssuerSchema = z
  .object({
    userId: z.string().min(1),
    role: z.enum(['boss', 'stylist']),
  })
  .strict()

export type Command<T extends CommandType = CommandType> = {
  [K in T]: {
    v: 1
    id: CommandId
    type: K
    issuedBy: CommandIssuer
    issuedAt: Iso
    payload: CommandPayloads[K]
  }
}[T]

export const CommandEnvelopeSchema = z
  .object({
    v: z.literal(1),
    id: CommandIdSchema,
    type: CommandTypeSchema,
    issuedBy: CommandIssuerSchema,
    issuedAt: IsoSchema,
    payload: z.unknown(),
  })
  .strict()

export const CommandSchema: z.ZodType<Command> = z.custom<Command>(
  (val): val is Command => parseCommand(val).ok,
  { message: 'Invalid Command' },
)

export interface CommandAck {
  commandId: CommandId
  status: 'accepted' | 'rejected'
  reason?: string
}

export const CommandAckSchema = z
  .object({
    commandId: CommandIdSchema,
    status: z.enum(['accepted', 'rejected']),
    reason: z.string().optional(),
  })
  .strict()

export type ParseCommandResult =
  | { ok: true; command: Command }
  | { ok: false; reason: string }

export function parseCommand(raw: unknown): ParseCommandResult {
  const env = CommandEnvelopeSchema.safeParse(raw)
  if (!env.success) {
    return {
      ok: false,
      reason: env.error.issues.map((i) => `${i.path.join('.') || 'envelope'}: ${i.message}`).join('; '),
    }
  }
  const cmdType = env.data.type
  const payloadSchema = COMMAND_PAYLOAD_SCHEMAS[cmdType]
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
    command: {
      v: 1,
      id: env.data.id,
      type: cmdType,
      issuedBy: env.data.issuedBy,
      issuedAt: env.data.issuedAt,
      payload: payloadRes.data,
    } as Command,
  }
}

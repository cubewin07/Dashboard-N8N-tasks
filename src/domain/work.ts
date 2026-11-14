import { z } from 'zod'
import { CarriedItemSchema, type CarriedItem, type OrgConfig } from './config'
import type { OfficeEvent } from './events'
import {
  ApprovalLevelSchema,
  DepartmentIdSchema,
  EmployeeIdSchema,
  HelpIdSchema,
  IsoSchema,
  MessageIdSchema,
  PrioritySchema,
  QuestionIdSchema,
  ReviewIdSchema,
  TaskIdSchema,
  type ApprovalLevel,
  type DepartmentId,
  type EmployeeId,
  type HelpId,
  type Iso,
  type MessageId,
  type Priority,
  type QuestionId,
  type ReviewId,
  type TaskId,
} from './primitives'

export type PersonActivity =
  | 'idle'
  | 'working'
  | 'reviewing'
  | 'delivering'
  | 'asking'
  | 'waiting_answer'
  | 'helping'
  | 'in_meeting'
  | 'resting'
  | 'off_shift'

export const PersonActivitySchema = z.enum([
  'idle',
  'working',
  'reviewing',
  'delivering',
  'asking',
  'waiting_answer',
  'helping',
  'in_meeting',
  'resting',
  'off_shift',
])

export interface PersonLocationHint {
  floorKey: string
  target: 'desk' | 'office' | 'elevator' | 'waiting_seat' | 'other'
}

export const PersonLocationHintSchema = z.object({
  floorKey: z.string().min(1),
  target: z.enum(['desk', 'office', 'elevator', 'waiting_seat', 'other']),
})

export interface PersonRuntime {
  employeeId: EmployeeId
  activity: PersonActivity
  taskId: TaskId | null
  carrying: CarriedItem | null
  platformKey: string | null
  idleSince: Iso | null
  lastActiveAt: Iso
  location: PersonLocationHint | null
}

export const PersonRuntimeSchema = z.object({
  employeeId: EmployeeIdSchema,
  activity: PersonActivitySchema,
  taskId: TaskIdSchema.nullable(),
  carrying: CarriedItemSchema.nullable(),
  platformKey: z.string().nullable(),
  idleSince: IsoSchema.nullable(),
  lastActiveAt: IsoSchema,
  location: PersonLocationHintSchema.nullable(),
})

export type TaskStatus =
  | 'queued'
  | 'in_progress'
  | 'in_review'
  | 'waiting_help'
  | 'waiting_answer'
  | 'blocked'
  | 'done'
  | 'cancelled'
  | 'failed'

export const TaskStatusSchema = z.enum([
  'queued',
  'in_progress',
  'in_review',
  'waiting_help',
  'waiting_answer',
  'blocked',
  'done',
  'cancelled',
  'failed',
])

export interface Task {
  id: TaskId
  typeKey: string
  title: string
  detail: string | null
  departmentId: DepartmentId
  assigneeId: EmployeeId | null
  requestedBy: {
    kind: 'boss' | 'manager' | 'employee' | 'schedule' | 'customer'
    id: string | null
  }
  channel: 'telegram' | 'app' | 'schedule' | 'internal' | 'platform'
  platformKey: string | null
  shopId: string | null
  amountVnd: number | null
  tags: string[]
  priority: Priority
  createdAt: Iso
  startedAt: Iso | null
  finishedAt: Iso | null
  status: TaskStatus
  progress: number
  requiredLevel: ApprovalLevel
  matchedRuleIds: string[]
  parentTaskId: TaskId | null
  attempts: number
}

export const TaskSchema = z.object({
  id: TaskIdSchema,
  typeKey: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().nullable(),
  departmentId: DepartmentIdSchema,
  assigneeId: EmployeeIdSchema.nullable(),
  requestedBy: z.object({
    kind: z.enum(['boss', 'manager', 'employee', 'schedule', 'customer']),
    id: z.string().nullable(),
  }),
  channel: z.enum(['telegram', 'app', 'schedule', 'internal', 'platform']),
  platformKey: z.string().nullable(),
  shopId: z.string().nullable(),
  amountVnd: z.number().nonnegative().nullable(),
  tags: z.array(z.string()),
  priority: PrioritySchema,
  createdAt: IsoSchema,
  startedAt: IsoSchema.nullable(),
  finishedAt: IsoSchema.nullable(),
  status: TaskStatusSchema,
  progress: z.number().min(0).max(1),
  requiredLevel: ApprovalLevelSchema,
  matchedRuleIds: z.array(z.string()),
  parentTaskId: TaskIdSchema.nullable(),
  attempts: z.number().int().min(0),
})

export type ReviewDecision = 'approved' | 'changes_requested' | 'rejected'
export const ReviewDecisionSchema = z.enum(['approved', 'changes_requested', 'rejected'])

export type ReviewStatus = 'pending' | 'in_review' | ReviewDecision
export const ReviewStatusSchema = z.enum([
  'pending',
  'in_review',
  'approved',
  'changes_requested',
  'rejected',
])

export interface ReviewItem {
  id: ReviewId
  taskId: TaskId
  level: ApprovalLevel
  assigneeId: EmployeeId
  status: ReviewStatus
  priority: Priority
  createdAt: Iso
  decidedAt: Iso | null
  decidedBy: string | null
  note: string | null
}

export const ReviewItemSchema = z.object({
  id: ReviewIdSchema,
  taskId: TaskIdSchema,
  level: ApprovalLevelSchema,
  assigneeId: EmployeeIdSchema,
  status: ReviewStatusSchema,
  priority: PrioritySchema,
  createdAt: IsoSchema,
  decidedAt: IsoSchema.nullable(),
  decidedBy: z.string().nullable(),
  note: z.string().nullable(),
})

export interface Question {
  id: QuestionId
  taskId: TaskId
  fromId: EmployeeId
  toId: EmployeeId
  text: string
  status: 'open' | 'answered' | 'expired'
  inPerson: boolean
  createdAt: Iso
  answeredAt: Iso | null
}

export const QuestionSchema = z.object({
  id: QuestionIdSchema,
  taskId: TaskIdSchema,
  fromId: EmployeeIdSchema,
  toId: EmployeeIdSchema,
  text: z.string().min(1),
  status: z.enum(['open', 'answered', 'expired']),
  inPerson: z.boolean(),
  createdAt: IsoSchema,
  answeredAt: IsoSchema.nullable(),
})

export interface HelpRequest {
  id: HelpId
  taskId: TaskId
  fromId: EmployeeId
  specialty: string
  toId: EmployeeId | null
  round: number
  status: 'open' | 'accepted' | 'answered' | 'timed_out' | 'escalated'
  createdAt: Iso
  timeoutAt: Iso
}

export const HelpRequestSchema = z.object({
  id: HelpIdSchema,
  taskId: TaskIdSchema,
  fromId: EmployeeIdSchema,
  specialty: z.string().min(1),
  toId: EmployeeIdSchema.nullable(),
  round: z.number().int().positive(),
  status: z.enum(['open', 'accepted', 'answered', 'timed_out', 'escalated']),
  createdAt: IsoSchema,
  timeoutAt: IsoSchema,
})

export interface IntakeMessage {
  id: MessageId
  channel: 'telegram' | 'app'
  modality: 'text' | 'voice'
  fromUserId: string
  text: string
  at: Iso
  taskIds: TaskId[]
}

export const IntakeMessageSchema = z.object({
  id: MessageIdSchema,
  channel: z.enum(['telegram', 'app']),
  modality: z.enum(['text', 'voice']),
  fromUserId: z.string().min(1),
  text: z.string().min(1),
  at: IsoSchema,
  taskIds: z.array(TaskIdSchema),
})

export interface OfficeState {
  schema: 1
  now: Iso
  config: OrgConfig
  people: Record<EmployeeId, PersonRuntime>
  tasks: Record<TaskId, Task>
  reviews: Record<ReviewId, ReviewItem>
  questions: Record<QuestionId, Question>
  help: Record<HelpId, HelpRequest>
  messages: Record<MessageId, IntakeMessage>
  log: OfficeEvent[]
  seq: number
  lastHeartbeat?: {
    at: Iso
    source: 'sim' | 'worker'
    version: string
  } | null
}

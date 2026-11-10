import { z } from 'zod'

export type Label = { vi: string; en: string }
export type Iso = string
export type ApprovalLevel = 'reviewer' | 'dept_manager' | 'boss'

export const LEVEL_RANK: Record<ApprovalLevel, number> = {
  reviewer: 1,
  dept_manager: 2,
  boss: 3,
}

export type Priority = 'urgent' | 'high' | 'normal' | 'low'
export type ModelTier = 'strong' | 'standard' | 'cheap'

export type IdPrefix =
  | 'dep'
  | 'emp'
  | 'role'
  | 'shop'
  | 'task'
  | 'rev'
  | 'q'
  | 'help'
  | 'msg'
  | 'evt'
  | 'cmd'

export type Id<P extends string> = `${P}_${string}`

export type DepartmentId = Id<'dep'>
export type EmployeeId = Id<'emp'>
export type RoleId = Id<'role'>
export type ShopId = Id<'shop'>
export type TaskId = Id<'task'>
export type ReviewId = Id<'rev'>
export type QuestionId = Id<'q'>
export type HelpId = Id<'help'>
export type MessageId = Id<'msg'>
export type EventId = Id<'evt'>
export type CommandId = Id<'cmd'>

export const LabelSchema = z.object({
  vi: z.string().min(1),
  en: z.string().min(1),
})

export const IsoSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    'Invalid ISO-8601 timestamp',
  )

export const ApprovalLevelSchema = z.enum(['reviewer', 'dept_manager', 'boss'])
export const PrioritySchema = z.enum(['urgent', 'high', 'normal', 'low'])
export const ModelTierSchema = z.enum(['strong', 'standard', 'cheap'])

export function idSchema<P extends IdPrefix>(prefix: P) {
  const re = new RegExp(`^${prefix}_[A-Za-z0-9_]+$`)
  return z.custom<Id<P>>(
    (val): val is Id<P> => typeof val === 'string' && re.test(val),
    { message: `Expected ID with prefix "${prefix}_"` },
  )
}

export const DepartmentIdSchema = idSchema('dep')
export const EmployeeIdSchema = idSchema('emp')
export const RoleIdSchema = idSchema('role')
export const ShopIdSchema = idSchema('shop')
export const TaskIdSchema = idSchema('task')
export const ReviewIdSchema = idSchema('rev')
export const QuestionIdSchema = idSchema('q')
export const HelpIdSchema = idSchema('help')
export const MessageIdSchema = idSchema('msg')
export const EventIdSchema = idSchema('evt')
export const CommandIdSchema = idSchema('cmd')

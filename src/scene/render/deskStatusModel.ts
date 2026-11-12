import type { SlotType } from '@/domain/config'
import type { PersonActivity, TaskStatus } from '@/domain/work'

/** Monitor glow keys (`visualLanguage.deskGlow`). */
export type DeskGlow = 'off' | 'working' | 'blocked' | 'done'

/** Slots that carry a monitor (every workspace). */
export const DESK_SLOT_TYPES: ReadonlySet<SlotType> = new Set<SlotType>([
  'desk',
  'review_desk',
  'private_office',
  'manager_office',
  'boss_desk',
])

const BUSY: ReadonlySet<PersonActivity> = new Set<PersonActivity>([
  'working',
  'reviewing',
  'helping',
  'in_meeting',
  'asking',
  'waiting_answer',
  'delivering',
])

/**
 * P05-T04 (R1): what a desk's monitor shows for its owner. A blocked or
 * failed task glows red, finished work (in review / done) green, any open
 * task or review work blue; idle, resting and off-shift desks are dark.
 */
export function deskGlowFor(
  activity: PersonActivity | null | undefined,
  taskStatus: TaskStatus | null | undefined,
): DeskGlow {
  if (taskStatus === 'blocked' || taskStatus === 'failed') return 'blocked'
  if (taskStatus === 'in_review' || taskStatus === 'done') return 'done'
  if (!activity || !BUSY.has(activity)) return 'off'
  if (taskStatus === 'cancelled') return 'off'
  return 'working'
}

/** A progress ring is drawn only while a task is open on that desk. */
export function showsProgress(taskStatus: TaskStatus | null | undefined): boolean {
  return (
    taskStatus === 'in_progress' ||
    taskStatus === 'waiting_help' ||
    taskStatus === 'waiting_answer' ||
    taskStatus === 'blocked'
  )
}

/** Clamped progress (0..1) and the arc it fills, clockwise from 12 o'clock (rad). */
export function progressArc(progress: number): { fraction: number; angle: number } {
  const fraction = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0
  return { fraction, angle: fraction * Math.PI * 2 }
}

/**
 * Whether a point on the ring at `angle` (rad, clockwise from 12 o'clock,
 * any range) is inside the filled arc. Mirrors the fragment shader.
 */
export function arcCovers(angle: number, fraction: number): boolean {
  const twoPi = Math.PI * 2
  const a = ((angle % twoPi) + twoPi) % twoPi
  return a / twoPi < fraction
}

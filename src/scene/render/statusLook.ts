import type { VisualStatusKey } from '@/domain/visual'
import type { PersonActivity } from '@/domain/work'

/** Activities that read as "not working": no ring, no icon, desaturated (R2). */
const RESTING: ReadonlySet<PersonActivity> = new Set<PersonActivity>(['idle', 'resting', 'off_shift'])

/**
 * Which status look (ring colour, icon) a person gets (P05 §3.1). Idle,
 * resting and off-shift people get none; a blocked task wins over the
 * activity of anybody who is still on it.
 */
export function statusLook(activity: PersonActivity, taskBlocked: boolean): VisualStatusKey | null {
  if (RESTING.has(activity)) return null
  if (taskBlocked) return 'blocked'
  return activity as VisualStatusKey
}

/** True for activities rendered desaturated. */
export function isRestingActivity(activity: PersonActivity): boolean {
  return RESTING.has(activity)
}

import type { PersonActivity } from '@/domain/work'
import type { IntentKind } from './intents'
import type { Carry } from './types'

/**
 * P05-T04 (R1): what a person holds while settled at the desk. A courier's
 * paper (pick → drop) is not decided here: the plan owns it.
 *
 * - working at the desk: the task type's `carries` (the feed copies it into
 *   `PersonRuntime.carrying`): laptop, phone, camera…
 * - reviewing: a sheet from the own pile
 * - anything else: empty hands
 */
export function heldItemFor(
  activity: PersonActivity,
  runtimeCarrying: Carry | null,
  intentKind: IntentKind,
): Carry | null {
  if (intentKind === 'ReviewAtDesk') return 'document'
  if (intentKind === 'WorkAtDesk') {
    if (activity === 'reviewing') return 'document'
    return runtimeCarrying
  }
  return null
}

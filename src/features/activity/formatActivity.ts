import type { ActivitySentenceParts } from '@/domain/selectors'
import type { OfficeState, PersonActivity } from '@/domain/work'
import type { Lang, Messages } from '@/i18n'
import { fmt } from '@/lib/utils'

/** The actor's name, or the localized label for system / customer / boss. */
export function actorLabel(
  parts: Pick<ActivitySentenceParts, 'actorName' | 'actorKind'>,
  t: Messages,
): string {
  return parts.actorName ?? t.activity.actors[parts.actorKind]
}

export function formatActivitySentence(
  parts: ActivitySentenceParts,
  t: Messages,
  lang: Lang,
  state?: OfficeState | null,
): string {
  const template = t.activity.templates[parts.type]
  const actor = actorLabel(parts, t)
  const target = parts.targetName ?? t.activity.fallbacks.target
  const task = parts.taskTitle ?? t.activity.fallbacks.task

  const decision = parts.decision ? t.activity.decisions[parts.decision] : ''
  const level = parts.level ? t.activity.levels[parts.level] : ''

  const rawActivity = String(parts.slots.activity ?? '')
  const activity =
    rawActivity && rawActivity in t.org.activity
      ? t.org.activity[rawActivity as PersonActivity]
      : rawActivity

  const rawSpecialty = String(parts.slots.specialty ?? '')
  const specObj = state?.config.specialties.find((s) => s.key === rawSpecialty)
  const specialty = specObj ? specObj.label[lang] : rawSpecialty

  const scenario = parts.scenarioLabel
    ? parts.scenarioLabel[lang]
    : String(parts.slots.scenario ?? '')

  const rawReason = parts.reason ?? ''
  const reason =
    parts.type === 'staff.archived' && rawReason in t.activity.archiveReasons
      ? t.activity.archiveReasons[rawReason as keyof typeof t.activity.archiveReasons]
      : rawReason
  const rawChannel = String(parts.slots.channel ?? '')
  const channel =
    rawChannel in t.activity.channels
      ? t.activity.channels[rawChannel as keyof typeof t.activity.channels]
      : rawChannel
  const progress = parts.progressPercent ?? 0

  return fmt(template, {
    ...parts.slots,
    actor,
    target,
    task,
    decision,
    level,
    activity,
    specialty,
    scenario,
    reason,
    note: reason,
    channel,
    progress,
  })
}

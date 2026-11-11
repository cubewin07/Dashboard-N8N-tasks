import type { ActivitySentenceParts } from '@/domain/selectors'
import type { OfficeState, PersonActivity } from '@/domain/work'
import type { Lang, Messages } from '@/i18n'
import { fmt } from '@/lib/utils'

function localizeSystemActor(name: string, lang: Lang): string {
  if (lang === 'vi') return name
  if (name === 'Hệ thống') return 'System'
  if (name === 'Khách hàng') return 'Customer'
  if (name === 'Sếp') return 'Boss'
  return name
}

export function formatActivitySentence(
  parts: ActivitySentenceParts,
  t: Messages,
  lang: Lang,
  state?: OfficeState | null,
): string {
  const template = t.activity.templates[parts.type]
  const actor = localizeSystemActor(parts.actorName, lang)
  const target = parts.targetName
    ? localizeSystemActor(parts.targetName, lang)
    : lang === 'en'
      ? 'colleague'
      : 'đồng nghiệp'
  const task = parts.taskTitle ?? (lang === 'en' ? 'task' : 'công việc')

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

  const reason = parts.reason ?? ''
  const channel = String(parts.slots.channel ?? '')
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

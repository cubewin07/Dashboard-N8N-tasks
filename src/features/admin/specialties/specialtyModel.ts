// Pure helpers of the Specialties tab (P10-T08, R4).
import type { OrgConfig, Specialty } from '@/domain/config'

export interface SpecialtyUsage {
  people: number
  taskTypes: number
}

/** Who and what refers to a specialty: employees (archived too) and task types (own or helper). */
export function specialtyUsage(config: OrgConfig, key: string): SpecialtyUsage {
  return {
    people: config.employees.filter((e) => e.specialties.includes(key)).length,
    taskTypes: config.taskTypes.filter((t) => t.specialty === key || t.needsHelpFrom.includes(key)).length,
  }
}

/** Deletable only when nobody and no task type uses it (a used one can still be renamed). */
export function specialtyDeleteBlock(config: OrgConfig, specialty: Specialty): SpecialtyUsage | null {
  const usage = specialtyUsage(config, specialty.key)
  return usage.people + usage.taskTypes > 0 ? usage : null
}

export interface SpecialtyDraft {
  key: string
  label: Specialty['label']
  icon: string
  homeDepartmentKey: string | null
}

export const DEFAULT_SPECIALTY_ICON = 'Sparkles'

export function blankSpecialtyDraft(): SpecialtyDraft {
  return { key: '', label: { vi: '', en: '' }, icon: DEFAULT_SPECIALTY_ICON, homeDepartmentKey: null }
}

export function draftFromSpecialty(s: Specialty): SpecialtyDraft {
  return { key: s.key, label: { ...s.label }, icon: s.icon, homeDepartmentKey: s.homeDepartmentKey }
}

export function sameSpecialtyDraft(a: SpecialtyDraft, b: SpecialtyDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** The Specialty a draft stands for, or null while it is not saveable (en falls back to vi, R16). */
export function specialtyFromDraft(draft: SpecialtyDraft): Specialty | null {
  const vi = draft.label.vi.trim()
  const icon = draft.icon.trim()
  if (vi === '' || draft.key === '' || icon === '') return null
  return {
    key: draft.key,
    label: { vi, en: draft.label.en.trim() || vi },
    icon,
    homeDepartmentKey: draft.homeDepartmentKey,
  }
}

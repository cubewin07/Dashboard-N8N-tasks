// Pure model for the Policy tab (R6): every editable field of `Policy` with unit, range and
// default, plus the cross-field checks the form can do itself.
import type { Policy } from '@/domain/config'

export type PolicyGroup = 'staffing' | 'help' | 'priority' | 'approvals'
export type UnitKey = 'person' | 'minute' | 'round' | 'point' | 'pointPerHour' | 'time' | 'question'
export type FieldCopyKey =
  | 'tempCap'
  | 'minIdleMinutesBeforeDrop'
  | 'helpTimeoutMinutes'
  | 'helpMaxRounds'
  | 'maxQuestionsPerTask'
  | 'weightUrgent'
  | 'weightHigh'
  | 'weightNormal'
  | 'weightLow'
  | 'agingPointsPerHour'
  | 'agingCapPoints'
  | 'questionSeatThreshold'
  | 'maxRetries'

export interface NumberField {
  id: FieldCopyKey
  group: PolicyGroup
  unit: UnitKey
  min: number
  max: number
  get: (p: Policy) => number
  set: (p: Policy, v: number) => Policy
}

const weight = (k: keyof Policy['priority']['weights']) => ({
  get: (p: Policy) => p.priority.weights[k],
  set: (p: Policy, v: number): Policy => ({
    ...p,
    priority: { ...p.priority, weights: { ...p.priority.weights, [k]: v } },
  }),
})

/** Ranges follow phase-10 §3.3 rule 7; the others are sensible bounds for a boss-edited form. */
export const NUMBER_FIELDS: readonly NumberField[] = [
  {
    id: 'tempCap',
    group: 'staffing',
    unit: 'person',
    min: 0,
    max: 50,
    get: (p) => p.staffing.tempCap,
    set: (p, v) => ({ ...p, staffing: { ...p.staffing, tempCap: v } }),
  },
  {
    id: 'minIdleMinutesBeforeDrop',
    group: 'staffing',
    unit: 'minute',
    min: 0,
    max: 1440,
    get: (p) => p.staffing.minIdleMinutesBeforeDrop,
    set: (p, v) => ({ ...p, staffing: { ...p.staffing, minIdleMinutesBeforeDrop: v } }),
  },
  {
    id: 'helpTimeoutMinutes',
    group: 'help',
    unit: 'minute',
    min: 5,
    max: 480,
    get: (p) => p.help.timeoutMinutes,
    set: (p, v) => ({ ...p, help: { ...p.help, timeoutMinutes: v } }),
  },
  {
    id: 'helpMaxRounds',
    group: 'help',
    unit: 'round',
    min: 1,
    max: 5,
    get: (p) => p.help.maxRounds,
    set: (p, v) => ({ ...p, help: { ...p.help, maxRounds: v } }),
  },
  {
    id: 'maxQuestionsPerTask',
    group: 'help',
    unit: 'question',
    min: 0,
    max: 10,
    get: (p) => p.work.maxQuestionsPerTask,
    set: (p, v) => ({ ...p, work: { ...p.work, maxQuestionsPerTask: v } }),
  },
  { id: 'weightUrgent', group: 'priority', unit: 'point', min: 0, max: 10000, ...weight('urgent') },
  { id: 'weightHigh', group: 'priority', unit: 'point', min: 0, max: 10000, ...weight('high') },
  { id: 'weightNormal', group: 'priority', unit: 'point', min: 0, max: 10000, ...weight('normal') },
  { id: 'weightLow', group: 'priority', unit: 'point', min: 0, max: 10000, ...weight('low') },
  {
    id: 'agingPointsPerHour',
    group: 'priority',
    unit: 'pointPerHour',
    min: 0,
    max: 1000,
    get: (p) => p.priority.agingPointsPerHour,
    set: (p, v) => ({ ...p, priority: { ...p.priority, agingPointsPerHour: v } }),
  },
  {
    id: 'agingCapPoints',
    group: 'priority',
    unit: 'point',
    min: 0,
    max: 10000,
    get: (p) => p.priority.agingCapPoints,
    set: (p, v) => ({ ...p, priority: { ...p.priority, agingCapPoints: v } }),
  },
  {
    id: 'questionSeatThreshold',
    group: 'approvals',
    unit: 'question',
    min: 1,
    max: 10,
    get: (p) => p.approvals.questionSeatThreshold,
    set: (p, v) => ({ ...p, approvals: { ...p.approvals, questionSeatThreshold: v } }),
  },
  {
    id: 'maxRetries',
    group: 'approvals',
    unit: 'time',
    min: 0,
    max: 10,
    get: (p) => p.work.maxRetries,
    set: (p, v) => ({ ...p, work: { ...p.work, maxRetries: v } }),
  },
]

export type TimeFieldId = 'workStart' | 'workEnd' | 'lunchStart' | 'lunchEnd'

export interface TimeField {
  id: TimeFieldId
  get: (p: Policy) => string
  set: (p: Policy, v: string) => Policy
}

export const TIME_FIELDS: readonly TimeField[] = [
  {
    id: 'workStart',
    get: (p) => p.calendar.workStart,
    set: (p, v) => ({ ...p, calendar: { ...p.calendar, workStart: v } }),
  },
  {
    id: 'lunchStart',
    get: (p) => p.calendar.lunch[0],
    set: (p, v) => ({ ...p, calendar: { ...p.calendar, lunch: [v, p.calendar.lunch[1]] } }),
  },
  {
    id: 'lunchEnd',
    get: (p) => p.calendar.lunch[1],
    set: (p, v) => ({ ...p, calendar: { ...p.calendar, lunch: [p.calendar.lunch[0], v] } }),
  },
  {
    id: 'workEnd',
    get: (p) => p.calendar.workEnd,
    set: (p, v) => ({ ...p, calendar: { ...p.calendar, workEnd: v } }),
  },
]

export function isValidNumber(field: NumberField, value: number): boolean {
  return Number.isInteger(value) && value >= field.min && value <= field.max
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function isValidTime(value: string): boolean {
  return HHMM.test(value)
}

export type PolicyFormError = 'weightOrder' | 'workHours' | 'lunchOrder' | 'lunchInside'

/** Cross-field problems the form can see itself (the validator may report more). */
export function crossFieldErrors(p: Policy): PolicyFormError[] {
  const errors: PolicyFormError[] = []
  const w = p.priority.weights
  if (!(w.urgent > w.high && w.high > w.normal && w.normal > w.low)) errors.push('weightOrder')
  const { workStart, workEnd, lunch } = p.calendar
  const times = [workStart, workEnd, lunch[0], lunch[1]]
  if (times.every(isValidTime)) {
    if (workStart >= workEnd) errors.push('workHours')
    else {
      if (lunch[0] >= lunch[1]) errors.push('lunchOrder')
      else if (lunch[0] < workStart || lunch[1] > workEnd) errors.push('lunchInside')
    }
  }
  return errors
}

/** Field ids that are individually out of range or empty. */
export function invalidFieldIds(p: Policy): string[] {
  const bad: string[] = []
  for (const f of NUMBER_FIELDS) if (!isValidNumber(f, f.get(p))) bad.push(f.id)
  for (const f of TIME_FIELDS) if (!isValidTime(f.get(p))) bad.push(f.id)
  return bad
}

export function isPolicyValid(p: Policy): boolean {
  return invalidFieldIds(p).length === 0 && crossFieldErrors(p).length === 0
}

/** Compare by value; NaN (an emptied input) counts as different from every number. */
export function isPolicyDirty(draft: Policy, saved: Policy): boolean {
  return JSON.stringify(draft) !== JSON.stringify(saved)
}

/** Put one field back to the seed value. */
export function resetNumberField(draft: Policy, seed: Policy, field: NumberField): Policy {
  return field.set(draft, field.get(seed))
}

export function resetTimeField(draft: Policy, seed: Policy, field: TimeField): Policy {
  return field.set(draft, field.get(seed))
}

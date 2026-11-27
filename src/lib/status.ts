// The ONE place for status → colour/icon/i18n-key mappings. Don't re-derive these in components.
import type { Priority } from '@/domain/primitives'
import type { PersonActivity } from '@/domain/work'

export type Tone = 'working' | 'waiting' | 'blocked' | 'done' | 'idle' | 'offline'

export const activityTone: Record<PersonActivity, Tone> = {
  idle: 'idle',
  working: 'working',
  reviewing: 'working',
  delivering: 'working',
  asking: 'waiting',
  waiting_answer: 'waiting',
  helping: 'working',
  in_meeting: 'working',
  resting: 'idle',
  off_shift: 'offline',
}

export const priorityTone: Record<Priority, Tone> = {
  urgent: 'blocked',
  high: 'waiting',
  normal: 'working',
  low: 'idle',
}

export const toneClasses: Record<Tone, { text: string; bg: string; dot: string; border: string }> = {
  working: { text: 'text-working', bg: 'bg-working-soft', dot: 'bg-working', border: 'border-working/30' },
  waiting: { text: 'text-waiting', bg: 'bg-waiting-soft', dot: 'bg-waiting', border: 'border-waiting/30' },
  blocked: { text: 'text-blocked', bg: 'bg-blocked-soft', dot: 'bg-blocked', border: 'border-blocked/30' },
  done: { text: 'text-done', bg: 'bg-done-soft', dot: 'bg-done', border: 'border-done/30' },
  idle: { text: 'text-muted-foreground', bg: 'bg-idle-soft', dot: 'bg-idle', border: 'border-border' },
  offline: { text: 'text-muted-foreground', bg: 'bg-idle-soft striped-offline', dot: 'bg-idle', border: 'border-border' },
}

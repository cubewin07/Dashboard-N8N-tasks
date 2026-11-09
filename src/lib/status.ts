// The ONE place for status → colour/icon/i18n-key mappings. Don't re-derive these in components.
import type { EmpStatus, StepStatus, TaskStatus, OwnerKey } from '@/lib/database.types'

export type Tone = 'working' | 'waiting' | 'blocked' | 'done' | 'idle' | 'offline'

export const toneClasses: Record<Tone, { text: string; bg: string; dot: string; border: string }> = {
  working: { text: 'text-working', bg: 'bg-working-soft', dot: 'bg-working', border: 'border-working/30' },
  waiting: { text: 'text-waiting', bg: 'bg-waiting-soft', dot: 'bg-waiting', border: 'border-waiting/30' },
  blocked: { text: 'text-blocked', bg: 'bg-blocked-soft', dot: 'bg-blocked', border: 'border-blocked/30' },
  done: { text: 'text-done', bg: 'bg-done-soft', dot: 'bg-done', border: 'border-done/30' },
  idle: { text: 'text-muted-foreground', bg: 'bg-idle-soft', dot: 'bg-idle', border: 'border-border' },
  offline: { text: 'text-muted-foreground', bg: 'bg-idle-soft striped-offline', dot: 'bg-idle', border: 'border-border' },
}

export const empStatusTone: Record<EmpStatus, Tone> = { idle: 'idle', working: 'working', waiting_boss: 'waiting', blocked: 'blocked' }

export const taskStatusTone: Record<TaskStatus, Tone> = {
  queued: 'idle',
  running: 'working',
  waiting_boss: 'waiting',
  blocked: 'blocked',
  done: 'done',
  failed: 'blocked',
  cancelled: 'idle',
}

export const stepStatusTone: Record<StepStatus, Tone> = {
  pending: 'idle',
  running: 'working',
  done: 'done',
  failed: 'blocked',
  stuck: 'blocked',
  skipped: 'idle',
}

/** Task list tabs → statuses. */
export const taskTabs = {
  active: ['queued', 'running'],
  waiting: ['waiting_boss'],
  blocked: ['blocked', 'failed'],
  done: ['done', 'cancelled'],
  all: ['queued', 'running', 'waiting_boss', 'blocked', 'done', 'failed', 'cancelled'],
} satisfies Record<string, TaskStatus[]>
export type TaskTab = keyof typeof taskTabs

/** Employee tint classes (avatar ring, step dots). Keys match employees.color. */
export const ownerTint: Record<OwnerKey, { text: string; bg: string; ring: string; solid: string }> = {
  thu: { text: 'text-emp-thu', bg: 'bg-emp-thu-soft', ring: 'ring-emp-thu', solid: 'bg-emp-thu' },
  mai: { text: 'text-emp-mai', bg: 'bg-emp-mai-soft', ring: 'ring-emp-mai', solid: 'bg-emp-mai' },
  linh: { text: 'text-emp-linh', bg: 'bg-emp-linh-soft', ring: 'ring-emp-linh', solid: 'bg-emp-linh' },
  ha: { text: 'text-emp-ha', bg: 'bg-emp-ha-soft', ring: 'ring-emp-ha', solid: 'bg-emp-ha' },
  vy: { text: 'text-emp-vy', bg: 'bg-emp-vy-soft', ring: 'ring-emp-vy', solid: 'bg-emp-vy' },
  an: { text: 'text-emp-an', bg: 'bg-emp-an-soft', ring: 'ring-emp-an', solid: 'bg-emp-an' },
  bao: { text: 'text-emp-bao', bg: 'bg-emp-bao-soft', ring: 'ring-emp-bao', solid: 'bg-emp-bao' },
  boss: { text: 'text-emp-boss', bg: 'bg-emp-boss-soft', ring: 'ring-emp-boss', solid: 'bg-emp-boss' },
}

/** Heartbeat older than this = team offline (docs/PLAN.md D5). */
export const HEARTBEAT_STALE_MS = 3 * 60_000

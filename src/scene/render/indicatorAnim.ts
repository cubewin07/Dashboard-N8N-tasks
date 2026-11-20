import type { EmployeeId } from '@/domain/primitives'

/** Seconds a ring or icon takes to ease in after the status changes. */
export const EASE_IN_SECONDS = 0.25
/** Bubbles shrink away over this long when an emote ends. */
export const POP_OUT_SECONDS = 0.15
/** Icon bob: height (m) and cycles per second. */
export const BOB = { height: 0.025, hz: 0.6 } as const
/** Below this opacity a person's indicators are not drawn at all. */
export const MIN_VISIBLE_OPACITY = 0.02

export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return 1 - (1 - c) ** 3
}

/** Vertical wobble of a status icon; 0 under reduced motion (`motion` = 0). */
export function iconBob(time: number, phase: number, motion: number): number {
  return Math.sin((time * BOB.hz + phase) * Math.PI * 2) * BOB.height * motion
}

/**
 * Remembers when each person's status last changed, so a new ring and icon
 * ease in instead of popping. Pure: time is whatever the caller feeds it.
 */
export class StatusEase {
  private readonly since = new Map<EmployeeId, { status: string; at: number; seen: number }>()
  private frame = 0

  begin(): void {
    this.frame += 1
  }

  /** 0..1 ease for this person's status now; 1 when `instant`. */
  value(id: EmployeeId, status: string, now: number, instant: boolean): number {
    let s = this.since.get(id)
    // Absent for a frame (hidden floor) counts as new, like a fresh status.
    if (!s || s.status !== status || this.frame - s.seen > 1) {
      s = { status, at: now, seen: this.frame }
      this.since.set(id, s)
    }
    s.seen = this.frame
    return instant ? 1 : easeOutCubic((now - s.at) / EASE_IN_SECONDS)
  }

  /** Drop people who have not been seen for a while (call now and then). */
  prune(): void {
    if (this.frame % 240 !== 0) return
    for (const [id, s] of this.since) if (this.frame - s.seen > 240) this.since.delete(id)
  }

  clear(): void {
    this.since.clear()
  }
}

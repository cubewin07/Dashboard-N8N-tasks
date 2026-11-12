import type { PoseKey } from '@/scene/director/poses'

/**
 * How a capsule person holds its body for a pose key. Everything is a
 * transform of two shapes (body, head), so P07b can replace the whole file
 * with animation clips without touching the director.
 *
 * Units: metres and radians, in the person's own frame (+Z is forward).
 */
export interface CapsulePose {
  /** Body height scale: a seated body is a shorter capsule on the chair. */
  squash: number
  /** Feet above the floor. */
  lift: number
  /** Lean forward (+) or back (−). */
  pitch: number
  /** Lean to the side. */
  roll: number
  /** Sideways step from the logical position. */
  side: number
  /** Head tilt forward (+) or back (−). */
  nod: number
  /** Head turned left/right (a head shake). */
  turn: number
  /** 0 upright … 1 lying on the back. */
  lie: number
}

export const CAPSULE = {
  bodyRadius: 0.2,
  /** Feet to shoulders. */
  bodyHeight: 1.15,
  headRadius: 0.18,
  /** Head centre above the feet when standing. */
  headY: 1.3,
  seatedSquash: 0.72,
  bedHeight: 0.4,
  carryY: 0.78,
  carryZ: 0.3,
  /** Extra forward reach of the hands when seated (over the desk / lap). */
  seatedReach: 0.12,
  /** Top of the head, for the status dot and the name label. */
  standTop: 1.48,
  seatedTop: 1.16,
  lyingTop: 0.85,
} as const

const DEG = Math.PI / 180

export function restPose(out: CapsulePose): CapsulePose {
  out.squash = 1
  out.lift = 0
  out.pitch = 0
  out.roll = 0
  out.side = 0
  out.nod = 0
  out.turn = 0
  out.lie = 0
  return out
}

/** A burst that is on for `on` seconds out of every `period`. */
function burst(t: number, period: number, on: number): number {
  const u = ((t % period) + period) % period
  if (u >= on) return 0
  return Math.sin((u / on) * Math.PI)
}

/**
 * Target pose at animation time `t` (seconds, stops while the office is
 * paused). `phase` de-synchronises people; `gait` is the walk cycle angle,
 * advanced by distance covered; `motion` is 0 for reduced motion.
 */
export function capsulePose(
  key: PoseKey,
  seated: boolean,
  t: number,
  phase: number,
  gait: number,
  speed01: number,
  motion: number,
  out: CapsulePose,
): CapsulePose {
  restPose(out)
  const tp = t + phase * 7
  if (seated) out.squash = CAPSULE.seatedSquash

  // Everybody breathes a little.
  const breathe = Math.sin(tp * 1.7) * 0.006 * motion
  out.lift += breathe

  switch (key) {
    case 'walk':
    case 'carry_walk': {
      const k = Math.min(1, Math.max(0.35, speed01)) * motion
      out.lift += Math.abs(Math.sin(gait)) * 0.04 * k
      out.roll = Math.sin(gait) * 6 * DEG * k
      out.pitch = (key === 'carry_walk' ? 2 : 5) * DEG
      out.nod = (key === 'carry_walk' ? 8 : 0) * DEG
      break
    }
    case 'stand':
      out.roll = Math.sin(tp * 0.5) * 1.2 * DEG * motion
      break
    case 'wait_stand':
    case 'wait_elevator':
      // Shifting weight from one foot to the other, glancing up at the floor number.
      out.roll = Math.sin(tp * 0.8) * 3 * DEG * motion
      out.nod = -burst(tp, 5.5, 1.4) * 14 * DEG * motion
      break
    case 'ride':
      out.nod = -6 * DEG
      break
    case 'sit':
      out.pitch = -3 * DEG
      break
    case 'sit_work':
      // Typing: a small steady lean with quick little nods.
      out.pitch = 7 * DEG
      out.nod = (12 + Math.sin(tp * 6.5) * 2.5 * motion) * DEG
      out.roll = Math.sin(tp * 0.6) * 1.5 * DEG * motion
      break
    case 'sit_read':
      out.pitch = 9 * DEG
      out.nod = (24 + Math.sin(tp * 0.9) * 3 * motion) * DEG
      out.turn = Math.sin(tp * 0.45) * 10 * DEG * motion
      break
    case 'sit_phone':
      out.pitch = 3 * DEG
      out.nod = 30 * DEG
      out.roll = Math.sin(tp * 0.7) * 2 * DEG * motion
      break
    case 'wait_seat':
      // Waiting for an answer: looking around, a bit restless.
      out.pitch = -2 * DEG
      out.turn = Math.sin(tp * 0.7) * 28 * DEG * motion
      out.roll = Math.sin(tp * 1.1) * 2 * DEG * motion
      break
    case 'talk':
      out.pitch = 4 * DEG
      out.lift += Math.abs(Math.sin(tp * 4.2)) * 0.012 * motion
      out.nod = Math.sin(tp * 4.2) * 7 * DEG * motion
      out.roll = Math.sin(tp * 1.3) * 3 * DEG * motion
      break
    case 'listen':
      out.roll = 4 * DEG
      out.nod = burst(tp, 3.2, 0.7) * 12 * DEG * motion
      break
    case 'stuck':
      // Leaning back and shaking the head.
      out.pitch = -6 * DEG
      out.turn = Math.sin(tp * 8) * burst(tp, 2.6, 1.3) * 26 * DEG * motion
      out.nod = 8 * DEG
      break
    case 'done':
      out.lift += burst(tp, 0.9, 0.45) * 0.14 * motion
      out.nod = -10 * DEG
      break
    case 'greet':
      out.roll = Math.sin(tp * 7) * 9 * DEG * motion
      out.lift += Math.abs(Math.sin(tp * 7)) * 0.03 * motion
      out.nod = -8 * DEG
      break
    case 'coffee':
    case 'tea':
      // A sip every few seconds.
      out.nod = -burst(tp, 4.6, 1.1) * 26 * DEG * motion
      out.roll = Math.sin(tp * 0.6) * 2 * DEG * motion
      break
    case 'sofa':
      out.pitch = -14 * DEG
      out.nod = 6 * DEG
      break
    case 'nap_desk':
      out.pitch = 34 * DEG
      out.nod = 40 * DEG
      out.lift += Math.sin(tp * 1.1) * 0.008 * motion
      break
    case 'sleep_bed':
      out.lie = 1
      out.lift = CAPSULE.bedHeight + Math.sin(tp * 1.1) * 0.012 * motion
      break
    case 'play_pingpong':
      out.side = Math.sin(tp * 3.1) * 0.28 * motion
      out.lift += Math.abs(Math.sin(tp * 6.2)) * 0.05 * motion
      out.pitch = 10 * DEG
      out.roll = Math.cos(tp * 3.1) * 7 * DEG * motion
      break
    case 'play_arcade':
      out.pitch = 8 * DEG
      out.nod = 6 * DEG
      out.roll = Math.sin(tp * 9) * burst(tp, 1.8, 1.1) * 5 * DEG * motion
      out.lift += burst(tp, 6.3, 0.5) * 0.08 * motion
      break
    case 'play_boardgame':
      out.pitch = (6 + burst(tp, 5.2, 1.6) * 14 * motion) * DEG
      out.nod = 14 * DEG
      break
    case 'karaoke':
      out.roll = Math.sin(tp * 2.6) * 9 * DEG * motion
      out.lift += Math.abs(Math.sin(tp * 5.2)) * 0.035 * motion
      out.nod = -12 * DEG
      break
    default: {
      const exhaustive: never = key
      return exhaustive
    }
  }
  return out
}

/** Critically damped-ish blend so sitting down or stopping never snaps. */
export function blendPose(current: CapsulePose, target: CapsulePose, k: number): void {
  current.squash += (target.squash - current.squash) * k
  current.lift += (target.lift - current.lift) * k
  current.pitch += (target.pitch - current.pitch) * k
  current.roll += (target.roll - current.roll) * k
  current.side += (target.side - current.side) * k
  current.nod += (target.nod - current.nod) * k
  current.turn += (target.turn - current.turn) * k
  current.lie += (target.lie - current.lie) * k
}

/** Height of the top of the head above the feet, for dots and labels. */
export function poseTop(pose: CapsulePose): number {
  const upright = CAPSULE.standTop - (1 - pose.squash) * CAPSULE.bodyHeight
  return pose.lift + upright + (CAPSULE.lyingTop - CAPSULE.bedHeight - upright) * pose.lie
}

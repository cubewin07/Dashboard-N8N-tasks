import { peopleRuntime } from './peopleRuntime'

/**
 * Animation time for the decorative life (fans, fish, the cat's trot). It
 * advances only while the office clock runs, so a paused office is still, and
 * resumes without a jump (the renderer clock keeps running while paused).
 * Several layers ask once per frame; the first caller of a frame advances it.
 */
const state = { lastElapsed: -1, time: 0 }

export function lifeTime(elapsed: number, delta: number): number {
  if (elapsed !== state.lastElapsed) {
    state.lastElapsed = elapsed
    if (peopleRuntime.moveFactor > 0) state.time += Math.min(Math.max(delta, 0), 0.25)
  }
  return state.time
}

/** Test hook. */
export function resetLifeClock(): void {
  state.lastElapsed = -1
  state.time = 0
}

/**
 * A fish turns around over a short stretch of its swim instead of flipping:
 * `velocity` is cos of its swim phase (1 = full speed right, -1 = left).
 */
export function fishYaw(velocity: number): number {
  const k = 4
  return (Math.PI / 2) * (1 - Math.max(-1, Math.min(1, velocity * k)))
}

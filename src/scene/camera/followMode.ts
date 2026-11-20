/**
 * Follow camera numbers and rules. Pure: the rig applies them.
 * The camera keeps its angle and orbits around the person's chest.
 */
export const FOLLOW = {
  /** Look-at point above the feet (metres). */
  targetHeight: 1.0,
  /** Distance the camera settles at when a follow starts. */
  distance: 9,
  minDistance: 3.5,
  maxDistance: 26,
  minPolarAngle: 0.25,
  maxPolarAngle: 1.35,
  /** How quickly the target catches up with the person (seconds). */
  smoothTime: 0.28,
  /** How long a followed id may be unknown before the follow is dropped (seconds). */
  graceSeconds: 3,
} as const

export interface FollowView {
  mode: 'overview' | 'free' | 'floor'
  focusedFloorKey: string | null
}

/**
 * The rig moves the view to the person's floor. Anything else that changes
 * the view (mode bar, floor picker, keyboard, a click on another floor) is
 * the user leaving follow.
 */
export function userLeftFollow(view: FollowView, rigFloorKey: string | null): boolean {
  if (rigFloorKey === null) return false
  return view.mode !== 'floor' || view.focusedFloorKey !== rigFloorKey
}

/**
 * The floor the follow camera should be showing. In the elevator the sight
 * names the destination (or '' when unknown): the view switches once when the
 * ride starts and stays put while the car passes floors. Null = leave the view.
 */
export function followFloorKey(
  sight: { floorKey: string; riding: boolean },
  rigFloorKey: string | null,
): string | null {
  if (sight.floorKey !== '') return sight.floorKey
  return sight.riding ? null : rigFloorKey
}

/**
 * Azimuth limits that still contain the camera's current azimuth. Limits
 * that exclude it make camera-controls rotate the view back into range (a
 * visible swing) the moment follow ends.
 */
export function widenAzimuth(
  min: number,
  max: number,
  current: number,
): { min: number; max: number } {
  if (!Number.isFinite(current)) return { min, max }
  return { min: Math.min(min, current), max: Math.max(max, current) }
}

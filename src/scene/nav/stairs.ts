/**
 * Stairs timing (P04 §3.2). A person fades out at the stairs entry, is "in the
 * stairwell" for `stairsTime` seconds and fades in on the target floor.
 */
export const STAIRS_BASE_SECONDS = 6
export const STAIRS_SECONDS_PER_FLOOR = 4

/** 6 s + 4 s per floor travelled; 0 when the floor does not change. */
export function stairsTime(fromFloor: number, toFloor: number): number {
  const floors = Math.abs(toFloor - fromFloor)
  if (floors === 0) return 0
  return STAIRS_BASE_SECONDS + STAIRS_SECONDS_PER_FLOOR * floors
}

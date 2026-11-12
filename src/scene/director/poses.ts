/**
 * The one list of pose / animation keys (00-overview §7). The director writes
 * these, the active PersonVisual implementation maps them to a look: capsules
 * in P04, animation clips from P07b. Unknown key → `stand`.
 */
export const POSE_KEYS = [
  // P04: implemented by the capsule placeholder
  'stand',
  'walk',
  'carry_walk',
  'wait_stand',
  'wait_elevator',
  'ride',
  'sit',
  'sit_work',
  'sit_read',
  'sit_phone',
  'wait_seat',
  'talk',
  'listen',
  'stuck',
  'done',
  'greet',
  // P05: idle behaviours
  'coffee',
  'tea',
  'sofa',
  'nap_desk',
  'sleep_bed',
  'play_pingpong',
  'play_arcade',
  'play_boardgame',
  'karaoke',
] as const

export type PoseKey = (typeof POSE_KEYS)[number]

const POSE_SET: ReadonlySet<string> = new Set(POSE_KEYS)

export function toPoseKey(key: string): PoseKey {
  return POSE_SET.has(key) ? (key as PoseKey) : 'stand'
}

const SEATED: ReadonlySet<PoseKey> = new Set<PoseKey>([
  'sit',
  'sit_work',
  'sit_read',
  'sit_phone',
  'wait_seat',
  'sofa',
  'nap_desk',
  'tea',
  'play_boardgame',
])

/** Poses a station puts a body on a seat for (the bed is lying, not sitting). */
export function isSeatedPose(key: PoseKey): boolean {
  return SEATED.has(key)
}

import type { Slot } from '@/domain/config'
import { makeRng } from '@/scene/director/rng'
import type { BuildingLayout, FloorKind, FloorLayout } from '@/scene/layout'

/**
 * P05-T12 (R11, D8): one decorative cat for the building. By day it
 * wanders the lobby's `cat_spot`s, at night the games & rest floor's; it
 * teleports between the two floors (never stairs or elevator). Pure: the
 * pose is a function of feed time only.
 */

export interface CatSpot {
  x: number
  z: number
}

export interface CatHome {
  floorIndex: number
  spots: CatSpot[]
}

export interface CatHomes {
  day: CatHome | null
  night: CatHome | null
}

/** Minutes the cat sits at a spot, then minutes it walks to the next one. */
export const CAT_DWELL_MINUTES = 15
export const CAT_WALK_MINUTES = 5

function spotsOf(floor: FloorLayout): CatSpot[] {
  const pick = (type: Slot['type']) => floor.slots.filter((s) => s.type === type)
  // A floor without cat spots lends its decor corners (plants) instead.
  const slots = pick('cat_spot').length > 0 ? pick('cat_spot') : pick('decor')
  if (slots.length > 0) return slots.map((s) => ({ x: s.x, z: s.z }))
  return [{ x: floor.size.w / 2, z: floor.size.d / 2 }]
}

function homeOn(layout: BuildingLayout, kind: FloorKind): CatHome | null {
  const floor = layout.floors.find((f) => f.kind === kind && f.annexIndex === 0)
  return floor ? { floorIndex: floor.index, spots: spotsOf(floor) } : null
}

export function catHomes(layout: BuildingLayout): CatHomes {
  const day = homeOn(layout, 'lobby_cafe')
  const night = homeOn(layout, 'games_rest') ?? day
  return { day: day ?? night, night }
}

/** Seeded visiting order of a home's spots (stable for a layout). */
export function catLoop(home: CatHome, seed: string): CatSpot[] {
  const order = home.spots.slice()
  const rng = makeRng(`cat:${seed}:${home.floorIndex}`)
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const t = order[i]!
    order[i] = order[j]!
    order[j] = t
  }
  return order
}

export interface CatPose {
  floorIndex: number
  x: number
  z: number
  /** Floor-local heading, atan2(dx, dz). */
  heading: number
  walking: boolean
}

/**
 * Where the cat is at `minutes` (feed minutes since epoch) on a home:
 * sits at loop spot k for the dwell, then walks a straight line to k + 1.
 */
export function catAt(home: CatHome, loop: readonly CatSpot[], minutes: number): CatPose {
  const n = loop.length
  const segment = CAT_DWELL_MINUTES + CAT_WALK_MINUTES
  const k = Math.floor(minutes / segment)
  const inSeg = minutes - k * segment
  const idx = ((k % n) + n) % n
  const from = loop[idx]!
  const to = loop[(idx + 1) % n]!
  const dx = to.x - from.x
  const dz = to.z - from.z
  const heading = dx === 0 && dz === 0 ? 0 : Math.atan2(dx, dz)
  if (n < 2 || inSeg < CAT_DWELL_MINUTES) {
    return { floorIndex: home.floorIndex, x: from.x, z: from.z, heading, walking: false }
  }
  const t = (inSeg - CAT_DWELL_MINUTES) / CAT_WALK_MINUTES
  return {
    floorIndex: home.floorIndex,
    x: from.x + dx * t,
    z: from.z + dz * t,
    heading,
    walking: true,
  }
}

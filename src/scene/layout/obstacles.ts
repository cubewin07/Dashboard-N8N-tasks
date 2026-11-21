import type { Slot, SlotType } from '@/domain/config'

/**
 * The floor area a slot's furniture blocks, in the slot's local frame
 * (metres, before `rotY`). `offsetX/offsetZ` move the rectangle away from the
 * slot origin, also in the local frame.
 */
export interface ObstacleSpec {
  halfX: number
  halfZ: number
  offsetX?: number
  offsetZ?: number
}

/**
 * Slot type → blocked rectangle of its main furniture piece, or `null` for
 * spots that are positions, not furniture.
 *
 * Dimensions are copied from `SLOT_BLOCKOUT` in `src/scene/render/blockoutSpec.ts`
 * (half of the box `size` x and z); keep the two tables in step. The layout
 * layer may not import from `scene/render`.
 *
 * Task chairs are left out on purpose: people sit on them, so the chair cell
 * must stay walkable.
 */
export const SLOT_OBSTACLE: Record<SlotType, ObstacleSpec | null> = {
  // Front edge padded by 0.15 m: two facing desks of a cluster sit 0.55 m apart,
  // and that gap must not rasterise as a walkable aisle.
  desk: { halfX: 0.6, halfZ: 0.4, offsetZ: 0.075 },
  review_desk: { halfX: 0.675, halfZ: 0.35 },
  private_office: { halfX: 0.8, halfZ: 0.4 },
  manager_office: { halfX: 0.9, halfZ: 0.425 },
  boss_desk: { halfX: 1.0, halfZ: 0.45 },
  waiting_seat: { halfX: 0.25, halfZ: 0.25 },
  meeting_table: { halfX: 1.2, halfZ: 0.6 },
  idle_sofa: { halfX: 0.85, halfZ: 0.4 },
  idle_coffee: { halfX: 0.75, halfZ: 0.35 },
  idle_tea_table: { halfX: 0.5, halfZ: 0.5 },
  idle_water: { halfX: 0.225, halfZ: 0.225 },
  idle_pingpong: { halfX: 1.2, halfZ: 0.7 },
  idle_arcade: { halfX: 0.4, halfZ: 0.4 },
  idle_boardgame: { halfX: 0.6, halfZ: 0.6 },
  idle_karaoke: { halfX: 0.9, halfZ: 0.8 },
  idle_bed: { halfX: 0.475, halfZ: 0.925 },
  idle_massage_chair: { halfX: 0.425, halfZ: 0.55 },
  // plant foliage (the widest part of the plant blockout)
  decor: { halfX: 0.275, halfZ: 0.275 },
  // spots, not furniture
  pile_anchor: null,
  elevator_door: null,
  stairs_entry: null,
  entrance: null,
  idle_chat: null,
  idle_window: null,
  cat_spot: null,
}

/** An oriented rectangle on the floor (floor-local metres). */
export interface ObstacleRect {
  cx: number
  cz: number
  halfX: number
  halfZ: number
  cos: number
  sin: number
}

/** True when the slot type is furniture that blocks floor area. */
export function slotBlocksFloor(type: SlotType): boolean {
  return SLOT_OBSTACLE[type] !== null
}

/**
 * The slot's furniture rectangle in floor coordinates, or `null` for spots.
 * Uses the same local→floor transform as the blockout renderer:
 * `x = slot.x + lx·cos + lz·sin`, `z = slot.z − lx·sin + lz·cos`.
 */
export function slotObstacleRect(slot: Slot): ObstacleRect | null {
  const spec = SLOT_OBSTACLE[slot.type]
  if (!spec) {
    return null
  }
  const cos = Math.cos(slot.rotY)
  const sin = Math.sin(slot.rotY)
  const ox = spec.offsetX ?? 0
  const oz = spec.offsetZ ?? 0
  return {
    cx: slot.x + ox * cos + oz * sin,
    cz: slot.z - ox * sin + oz * cos,
    halfX: spec.halfX,
    halfZ: spec.halfZ,
    cos,
    sin,
  }
}

/** Is the point inside the rectangle grown by `inflate` metres on every side? */
export function obstacleContains(rect: ObstacleRect, x: number, z: number, inflate = 0): boolean {
  const dx = x - rect.cx
  const dz = z - rect.cz
  const lx = dx * rect.cos - dz * rect.sin
  const lz = dx * rect.sin + dz * rect.cos
  const eps = 1e-9
  return (
    Math.abs(lx) <= rect.halfX + inflate + eps && Math.abs(lz) <= rect.halfZ + inflate + eps
  )
}

/** Axis-aligned bounds of the rectangle grown by `inflate` metres. */
export function obstacleBounds(
  rect: ObstacleRect,
  inflate = 0,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const hx = rect.halfX + inflate
  const hz = rect.halfZ + inflate
  const ex = Math.abs(hx * rect.cos) + Math.abs(hz * rect.sin)
  const ez = Math.abs(hx * rect.sin) + Math.abs(hz * rect.cos)
  return { minX: rect.cx - ex, maxX: rect.cx + ex, minZ: rect.cz - ez, maxZ: rect.cz + ez }
}

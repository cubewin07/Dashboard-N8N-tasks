import type { Slot, WallSegment } from '@/domain/config'
import type { FloorLayout } from '@/scene/layout'
import { obstacleBounds, obstacleContains, slotObstacleRect } from '@/scene/layout'
import type { Cell, NavGrid, Vec2 } from './types'

/** Cell size in metres. */
export const NAV_CELL = 0.5
/** Furniture rectangles are grown by this much before rasterising. */
export const OBSTACLE_INFLATE = 0.2
/**
 * A cell is part of a wall when its centre is within this distance of the wall
 * line. Walls lie on cell boundaries (centres are 0.25 m away), so a wall takes
 * the row of cells on each side of it: people keep ≥ 0.5 m from the wall line.
 */
export const WALL_HALF_THICKNESS = 0.3

/**
 * Core (elevator shaft + stairwell) extents, mirroring `ElevatorShaft.tsx` and
 * `Stairwell.tsx`: the shaft is `max(2.4, door span + 1.8)` m deep centred on
 * the doors; the stairs run 1.2 m before the entry and 2.1 m after it (ramps +
 * landing). Everything east of the door line between those is blocked.
 */
const SHAFT_MIN_DEPTH = 2.4
const SHAFT_DOOR_MARGIN = 1.8
const STAIRS_BEFORE = 1.2
const STAIRS_AFTER = 2.1

class Grid implements NavGrid {
  readonly floorKey: string
  readonly w: number
  readonly h: number
  readonly cell: number
  readonly blocked: Uint8Array

  constructor(floorKey: string, w: number, h: number, cell: number, blocked: Uint8Array) {
    this.floorKey = floorKey
    this.w = w
    this.h = h
    this.cell = cell
    this.blocked = blocked
  }

  isBlocked(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.w || row >= this.h) {
      return true
    }
    return this.blocked[row * this.w + col] === 1
  }

  /** Points on or just outside the floor edge are clamped onto the edge cells. */
  toCell(p: Vec2): Cell {
    const col = Math.min(this.w - 1, Math.max(0, Math.floor(p.x / this.cell)))
    const row = Math.min(this.h - 1, Math.max(0, Math.floor(p.z / this.cell)))
    return [col, row]
  }

  toWorld(col: number, row: number): Vec2 {
    return { x: (col + 0.5) * this.cell, z: (row + 0.5) * this.cell }
  }
}

/** Builds a grid from a raw blocked array (tests, tools). */
export function makeGrid(
  floorKey: string,
  w: number,
  h: number,
  blocked: Uint8Array,
  cell: number = NAV_CELL,
): NavGrid {
  if (blocked.length !== w * h) {
    throw new Error(`makeGrid: blocked has ${blocked.length} cells, expected ${w * h}`)
  }
  return new Grid(floorKey, w, h, cell, blocked)
}

/** Centre of a cell in metres. */
export function cellCenter(cell: Cell, size: number = NAV_CELL): Vec2 {
  return { x: (cell[0] + 0.5) * size, z: (cell[1] + 0.5) * size }
}

/** The cell a person stands on to use the slot (falls back to the slot's own cell). */
export function approachCell(slot: Slot, size: number = NAV_CELL): Cell {
  if (slot.approach) {
    return [slot.approach[0], slot.approach[1]]
  }
  return [Math.floor(slot.x / size), Math.floor(slot.z / size)]
}

/** Centre of the slot's approach cell in metres. */
export function approachPoint(slot: Slot): Vec2 {
  return cellCenter(approachCell(slot))
}

/**
 * The free cell closest to `p` (distance from `p` to the cell centre) within
 * `maxRadiusCells` cells of `p`'s own cell, or `null`. Ties resolve to the
 * lower row, then the lower column.
 */
export function nearestFreeCell(grid: NavGrid, p: Vec2, maxRadiusCells = 3): Cell | null {
  const [pc, pr] = grid.toCell(p)
  if (!grid.isBlocked(pc, pr)) {
    return [pc, pr]
  }
  let best: Cell | null = null
  let bestDist = Infinity
  for (let row = pr - maxRadiusCells; row <= pr + maxRadiusCells; row += 1) {
    for (let col = pc - maxRadiusCells; col <= pc + maxRadiusCells; col += 1) {
      if (grid.isBlocked(col, row)) {
        continue
      }
      const dx = (col + 0.5) * grid.cell - p.x
      const dz = (row + 0.5) * grid.cell - p.z
      const dist = dx * dx + dz * dz
      if (dist < bestDist - 1e-9) {
        bestDist = dist
        best = [col, row]
      }
    }
  }
  return best
}

function blockWallSpan(
  blocked: Uint8Array,
  w: number,
  h: number,
  cell: number,
  wall: WallSegment,
  from: number,
  to: number,
): void {
  const len = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1)
  if (len <= 0 || to - from <= 1e-9) {
    return
  }
  const ux = (wall.x2 - wall.x1) / len
  const uz = (wall.z2 - wall.z1) / len
  const ax = wall.x1 + ux * from
  const az = wall.z1 + uz * from
  const bx = wall.x1 + ux * to
  const bz = wall.z1 + uz * to
  const spanLen = to - from
  const t = WALL_HALF_THICKNESS
  const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - t) / cell))
  const c1 = Math.min(w - 1, Math.floor((Math.max(ax, bx) + t) / cell))
  const r0 = Math.max(0, Math.floor((Math.min(az, bz) - t) / cell))
  const r1 = Math.min(h - 1, Math.floor((Math.max(az, bz) + t) / cell))
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      const px = (col + 0.5) * cell - ax
      const pz = (row + 0.5) * cell - az
      const along = Math.min(spanLen, Math.max(0, px * ux + pz * uz))
      const dx = px - ux * along
      const dz = pz - uz * along
      if (dx * dx + dz * dz <= t * t) {
        blocked[row * w + col] = 1
      }
    }
  }
}

function blockWall(blocked: Uint8Array, w: number, h: number, cell: number, wall: WallSegment): void {
  const len = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1)
  if (!wall.door) {
    blockWallSpan(blocked, w, h, cell, wall, 0, len)
    return
  }
  const doorStart = Math.min(len, wall.door.offset)
  const doorEnd = Math.min(len, wall.door.offset + wall.door.width)
  blockWallSpan(blocked, w, h, cell, wall, 0, doorStart)
  blockWallSpan(blocked, w, h, cell, wall, doorEnd, len)
}

function blockRectByCentre(
  blocked: Uint8Array,
  w: number,
  h: number,
  cell: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): void {
  const c0 = Math.max(0, Math.floor(minX / cell))
  const c1 = Math.min(w - 1, Math.floor(maxX / cell))
  const r0 = Math.max(0, Math.floor(minZ / cell))
  const r1 = Math.min(h - 1, Math.floor(maxZ / cell))
  for (let row = r0; row <= r1; row += 1) {
    const z = (row + 0.5) * cell
    if (z < minZ || z > maxZ) continue
    for (let col = c0; col <= c1; col += 1) {
      const x = (col + 0.5) * cell
      if (x < minX || x > maxX) continue
      blocked[row * w + col] = 1
    }
  }
}

function blockCore(blocked: Uint8Array, w: number, h: number, cell: number, floor: FloorLayout): void {
  const doors = floor.elevatorDoorSlots
  const stairs = floor.stairsEntrySlot
  let minZ = Infinity
  let maxZ = -Infinity
  let lineX = Infinity
  if (doors.length > 0) {
    let dMin = Infinity
    let dMax = -Infinity
    for (const door of doors) {
      dMin = Math.min(dMin, door.z)
      dMax = Math.max(dMax, door.z)
      lineX = Math.min(lineX, door.x)
    }
    const depth = Math.max(SHAFT_MIN_DEPTH, dMax - dMin + SHAFT_DOOR_MARGIN)
    const mid = (dMin + dMax) / 2
    minZ = Math.min(minZ, mid - depth / 2)
    maxZ = Math.max(maxZ, mid + depth / 2)
  }
  if (stairs) {
    minZ = Math.min(minZ, stairs.z - STAIRS_BEFORE)
    maxZ = Math.max(maxZ, stairs.z + STAIRS_AFTER)
    if (doors.length === 0) {
      lineX = stairs.x - cell
    }
  }
  if (!Number.isFinite(lineX) || !Number.isFinite(minZ)) {
    return
  }
  blockRectByCentre(
    blocked,
    w,
    h,
    cell,
    lineX,
    w * cell,
    minZ - OBSTACLE_INFLATE,
    maxZ + OBSTACLE_INFLATE,
  )
}

/**
 * Blocks every free cell that cannot be walked to from `anchor`, except the
 * `keep` cells. After this, all free cells of the grid are mutually reachable,
 * so `nearestFreeCell` never lands in an enclosed pocket.
 */
function sealPockets(
  blocked: Uint8Array,
  w: number,
  h: number,
  anchor: number,
  keep: ReadonlySet<number>,
): void {
  if (blocked[anchor] === 1) {
    return
  }
  const seen = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  let top = 0
  stack[top++] = anchor
  seen[anchor] = 1
  while (top > 0) {
    const idx = stack[--top]!
    const col = idx % w
    const row = (idx - col) / w
    if (col > 0 && seen[idx - 1] === 0 && blocked[idx - 1] === 0) {
      seen[idx - 1] = 1
      stack[top++] = idx - 1
    }
    if (col < w - 1 && seen[idx + 1] === 0 && blocked[idx + 1] === 0) {
      seen[idx + 1] = 1
      stack[top++] = idx + 1
    }
    if (row > 0 && seen[idx - w] === 0 && blocked[idx - w] === 0) {
      seen[idx - w] = 1
      stack[top++] = idx - w
    }
    if (row < h - 1 && seen[idx + w] === 0 && blocked[idx + w] === 0) {
      seen[idx + w] = 1
      stack[top++] = idx + w
    }
  }
  for (let i = 0; i < blocked.length; i += 1) {
    if (blocked[i] === 0 && seen[i] === 0 && !keep.has(i)) {
      blocked[i] = 1
    }
  }
}

/**
 * Rasterises one floor into a walkability grid.
 *
 * Blocked: walls (door gaps left open), furniture footprint cells, furniture
 * rectangles grown by `OBSTACLE_INFLATE` (a cell is blocked when its centre is
 * inside), the elevator/stairs core east of the door line, and any free pocket
 * that cannot be reached from the first elevator door. Every slot's approach
 * cell is then forced free.
 */
export function buildGrid(floor: FloorLayout): NavGrid {
  const cell = NAV_CELL
  const w = Math.round(floor.size.w / cell)
  const h = Math.round(floor.size.d / cell)
  const blocked = new Uint8Array(w * h)

  for (const wall of floor.walls) {
    blockWall(blocked, w, h, cell, wall)
  }

  for (const slot of floor.slots) {
    const rect = slotObstacleRect(slot)
    if (!rect) {
      continue
    }
    for (const [col, row] of slot.footprint ?? []) {
      if (col >= 0 && row >= 0 && col < w && row < h) {
        blocked[row * w + col] = 1
      }
    }
    const b = obstacleBounds(rect, OBSTACLE_INFLATE)
    const c0 = Math.max(0, Math.floor(b.minX / cell))
    const c1 = Math.min(w - 1, Math.floor(b.maxX / cell))
    const r0 = Math.max(0, Math.floor(b.minZ / cell))
    const r1 = Math.min(h - 1, Math.floor(b.maxZ / cell))
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        if (obstacleContains(rect, (col + 0.5) * cell, (row + 0.5) * cell, OBSTACLE_INFLATE)) {
          blocked[row * w + col] = 1
        }
      }
    }
  }

  blockCore(blocked, w, h, cell, floor)

  const approaches = new Set<number>()
  for (const slot of floor.slots) {
    const [col, row] = approachCell(slot, cell)
    if (col >= 0 && row >= 0 && col < w && row < h) {
      blocked[row * w + col] = 0
      approaches.add(row * w + col)
    }
  }

  const anchorSlot = floor.elevatorDoorSlots[0] ?? floor.stairsEntrySlot
  if (anchorSlot) {
    const [col, row] = approachCell(anchorSlot, cell)
    if (col >= 0 && row >= 0 && col < w && row < h) {
      sealPockets(blocked, w, h, row * w + col, approaches)
    }
  }

  return new Grid(floor.key, w, h, cell, blocked)
}

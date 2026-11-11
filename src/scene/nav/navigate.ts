import { findPath } from './astar'
import { nearestFreeCell } from './grid'
import { hasLineOfSight, smoothPath } from './smooth'
import type { Cell, NavGrid, Vec2 } from './types'

/** Smoothed path between two free cells, as cell-centre points; `null` when unreachable. */
function centrePath(grid: NavGrid, from: Cell, to: Cell): Vec2[] | null {
  const cells = findPath(grid, from, to)
  if (!cells) {
    return null
  }
  return smoothPath(
    grid,
    cells.map(([col, row]) => grid.toWorld(col, row)),
  )
}

function samePoint(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9
}

/**
 * Puts the exact start and end points on a centre path. An end that has a
 * clear line to the neighbouring waypoint replaces its cell centre; otherwise
 * (blocked end, or too close to an obstacle) the centre stays as a waypoint.
 */
function attachEnds(grid: NavGrid, centres: readonly Vec2[], from: Vec2, to: Vec2): Vec2[] {
  const pts = centres.map((p) => ({ x: p.x, z: p.z }))
  const start = { x: from.x, z: from.z }
  const end = { x: to.x, z: to.z }

  if (pts.length === 1) {
    // Two points in the same free cell are always mutually walkable.
    const [fc, fr] = grid.toCell(start)
    const [tc, tr] = grid.toCell(end)
    const sameFreeCell = fc === tc && fr === tr && !grid.isBlocked(fc, fr)
    if (sameFreeCell || hasLineOfSight(grid, start, end)) {
      return [start, end]
    }
    const mid = pts[0]!
    const out = [start]
    if (!samePoint(mid, start) && !samePoint(mid, end)) {
      out.push(mid)
    }
    out.push(end)
    return out
  }

  if (samePoint(pts[0]!, start) || hasLineOfSight(grid, start, pts[1]!)) {
    pts[0] = start
  } else {
    pts.unshift(start)
  }
  const last = pts.length - 1
  if (samePoint(pts[last]!, end) || hasLineOfSight(grid, pts[last - 1]!, end)) {
    pts[last] = end
  } else {
    pts.push(end)
  }
  return pts
}

/**
 * Walking route on one floor: smoothed waypoints in metres, first = `from`
 * exactly, last = `to` exactly. An end lying in a blocked cell (a person on a
 * chair inside a furniture footprint) is searched from the nearest free cell;
 * the short hop between that cell and the exact point is the only part of the
 * route that may cross blocked cells. `null` when there is no route.
 */
export function navigate(grid: NavGrid, from: Vec2, to: Vec2): Vec2[] | null {
  const fromCell = nearestFreeCell(grid, from)
  const toCell = nearestFreeCell(grid, to)
  if (!fromCell || !toCell) {
    return null
  }
  const centres = centrePath(grid, fromCell, toCell)
  return centres ? attachEnds(grid, centres, from, to) : null
}

/** Total length of a polyline in metres. */
export function pathLength(points: readonly Vec2[]): number {
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z)
  }
  return total
}

/**
 * LRU cache of smoothed paths keyed by floor key + from cell + to cell.
 * `navigate` here returns exactly what the free `navigate` function returns.
 * Call `clear()` when the layout changes (`config.changed`).
 */
export class PathCache {
  private readonly capacity: number
  private readonly entries = new Map<string, Vec2[] | null>()

  constructor(capacity = 500) {
    this.capacity = Math.max(1, capacity)
  }

  get size(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }

  navigate(grid: NavGrid, from: Vec2, to: Vec2): Vec2[] | null {
    const fromCell = nearestFreeCell(grid, from)
    const toCell = nearestFreeCell(grid, to)
    if (!fromCell || !toCell) {
      return null
    }
    const key = `${grid.floorKey}|${fromCell[1] * grid.w + fromCell[0]}|${toCell[1] * grid.w + toCell[0]}`
    let centres: Vec2[] | null
    if (this.entries.has(key)) {
      centres = this.entries.get(key) ?? null
      // refresh recency
      this.entries.delete(key)
      this.entries.set(key, centres)
    } else {
      centres = centrePath(grid, fromCell, toCell)
      this.entries.set(key, centres)
      if (this.entries.size > this.capacity) {
        const oldest = this.entries.keys().next().value
        if (oldest !== undefined) {
          this.entries.delete(oldest)
        }
      }
    }
    return centres ? attachEnds(grid, centres, from, to) : null
  }
}

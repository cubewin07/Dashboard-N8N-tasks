import type { NavGrid, Vec2 } from './types'

/** Half the width of the corridor a walker needs for a shortcut (metres). */
export const WALKER_HALF_WIDTH = 0.2

/**
 * Exact grid walk of the thin segment a→b: false as soon as it enters (or
 * touches, at a shared corner) a blocked or out-of-bounds cell.
 */
function segmentClear(grid: NavGrid, ax: number, az: number, bx: number, bz: number): boolean {
  const cell = grid.cell
  let col = Math.floor(ax / cell)
  let row = Math.floor(az / cell)
  const endCol = Math.floor(bx / cell)
  const endRow = Math.floor(bz / cell)
  if (grid.isBlocked(col, row)) {
    return false
  }
  const dx = bx - ax
  const dz = bz - az
  const stepCol = dx > 0 ? 1 : dx < 0 ? -1 : 0
  const stepRow = dz > 0 ? 1 : dz < 0 ? -1 : 0
  let tMaxX = stepCol === 0 ? Infinity : ((col + (stepCol > 0 ? 1 : 0)) * cell - ax) / dx
  let tMaxZ = stepRow === 0 ? Infinity : ((row + (stepRow > 0 ? 1 : 0)) * cell - az) / dz
  const tDeltaX = stepCol === 0 ? Infinity : cell / Math.abs(dx)
  const tDeltaZ = stepRow === 0 ? Infinity : cell / Math.abs(dz)
  const eps = 1e-9

  let guard = grid.w + grid.h + 8
  while ((col !== endCol || row !== endRow) && guard > 0) {
    guard -= 1
    if (Math.min(tMaxX, tMaxZ) > 1 + eps) {
      break
    }
    if (Math.abs(tMaxX - tMaxZ) <= eps) {
      // Passing exactly through a grid corner: both side cells count as touched.
      if (grid.isBlocked(col + stepCol, row) || grid.isBlocked(col, row + stepRow)) {
        return false
      }
      col += stepCol
      row += stepRow
      tMaxX += tDeltaX
      tMaxZ += tDeltaZ
    } else if (tMaxX < tMaxZ) {
      col += stepCol
      tMaxX += tDeltaX
    } else {
      row += stepRow
      tMaxZ += tDeltaZ
    }
    if (grid.isBlocked(col, row)) {
      return false
    }
  }
  return !grid.isBlocked(endCol, endRow)
}

/**
 * Can a walker go straight from `a` to `b`? Conservative: the centre line and
 * two parallel lines `WALKER_HALF_WIDTH` to each side must all stay on free
 * cells, so `true` guarantees the segment never crosses a blocked cell.
 */
export function hasLineOfSight(grid: NavGrid, a: Vec2, b: Vec2): boolean {
  if (!segmentClear(grid, a.x, a.z, b.x, b.z)) {
    return false
  }
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-9) {
    return true
  }
  const nx = (-dz / len) * WALKER_HALF_WIDTH
  const nz = (dx / len) * WALKER_HALF_WIDTH
  return (
    segmentClear(grid, a.x + nx, a.z + nz, b.x + nx, b.z + nz) &&
    segmentClear(grid, a.x - nx, a.z - nz, b.x - nx, b.z - nz)
  )
}

/**
 * String pulling: from each kept point, jump to the farthest later point that
 * is in line of sight. Consecutive input points are assumed walkable (they are
 * when they come from `findPath`), so the result never adds a crossing.
 * Returns new point objects; first and last points are preserved.
 */
export function smoothPath(grid: NavGrid, points: readonly Vec2[]): Vec2[] {
  const n = points.length
  if (n <= 2) {
    return points.map((p) => ({ x: p.x, z: p.z }))
  }
  const out: Vec2[] = [{ x: points[0]!.x, z: points[0]!.z }]
  let anchor = 0
  while (anchor < n - 1) {
    let next = anchor + 1
    for (let j = n - 1; j > anchor + 1; j -= 1) {
      if (hasLineOfSight(grid, points[anchor]!, points[j]!)) {
        next = j
        break
      }
    }
    out.push({ x: points[next]!.x, z: points[next]!.z })
    anchor = next
  }
  return out
}

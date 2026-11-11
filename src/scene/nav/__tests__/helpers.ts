import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { buildBuildingLayout, buildFloorSlots, type FloorLayout } from '@/scene/layout'
import { makeGrid } from '../grid'
import type { NavGrid, Vec2 } from '../types'

/** Grid from ASCII rows: `#` blocked, anything else free. */
export function gridFromAscii(rows: readonly string[], floorKey = 'test'): NavGrid {
  const h = rows.length
  const w = rows[0]!.length
  const blocked = new Uint8Array(w * h)
  rows.forEach((line, row) => {
    for (let col = 0; col < w; col += 1) {
      if (line[col] === '#') blocked[row * w + col] = 1
    }
  })
  return makeGrid(floorKey, w, h, blocked)
}

/** Small seeded LCG (deterministic test randomness). */
export function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/**
 * Every floor of the seed building, plus department variants the seed does not
 * produce: a full floor (16 desks, 4 clusters) and an annex (1 cluster).
 */
export function allTestFloors(): FloorLayout[] {
  const config = makeSeedConfig()
  const layout = buildBuildingLayout(config)
  const floors = [...layout.floors]
  const dept = layout.floors.find((f) => f.kind === 'department')!
  const template = config.floorTemplates.find((t) => t.key === dept.templateKey)!
  const variant = (key: string, desks: number, annexIndex: number): FloorLayout => {
    const slots = buildFloorSlots(template, desks, annexIndex)
    return {
      ...dept,
      key,
      annexIndex,
      slots,
      elevatorDoorSlots: slots.filter((s) => s.type === 'elevator_door'),
      stairsEntrySlot: slots.find((s) => s.type === 'stairs_entry')!,
    }
  }
  floors.push(variant('dept_full', 16, 0), variant('dept_annex', 3, 1))
  return floors
}

/** Cells reachable from `start` with 4-neighbour moves (same reach as A* without corner cutting). */
export function floodFill(grid: NavGrid, start: readonly [number, number]): Uint8Array {
  const seen = new Uint8Array(grid.w * grid.h)
  if (grid.isBlocked(start[0], start[1])) return seen
  const stack = [start[1] * grid.w + start[0]]
  seen[stack[0]!] = 1
  while (stack.length > 0) {
    const idx = stack.pop()!
    const col = idx % grid.w
    const row = (idx - col) / grid.w
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = col + dc
      const nr = row + dr
      if (grid.isBlocked(nc, nr)) continue
      const next = nr * grid.w + nc
      if (seen[next] === 0) {
        seen[next] = 1
        stack.push(next)
      }
    }
  }
  return seen
}

/** First point (sampled every `step` m along the polyline) lying in a blocked cell, or null. */
export function firstBlockedSample(grid: NavGrid, points: readonly Vec2[], step = 0.1): Vec2 | null {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!
    const b = points[i]!
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const n = Math.max(1, Math.ceil(len / step))
    for (let k = 0; k <= n; k += 1) {
      const t = k / n
      const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
      if (grid.isBlocked(Math.floor(p.x / grid.cell), Math.floor(p.z / grid.cell))) return p
    }
  }
  return null
}

export function freeCells(grid: NavGrid): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let row = 0; row < grid.h; row += 1) {
    for (let col = 0; col < grid.w; col += 1) {
      if (!grid.isBlocked(col, row)) out.push([col, row])
    }
  }
  return out
}

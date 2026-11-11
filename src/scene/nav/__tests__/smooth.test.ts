import { describe, expect, it } from 'vitest'
import { findPath } from '../astar'
import { buildGrid } from '../grid'
import { hasLineOfSight, smoothPath } from '../smooth'
import { allTestFloors, firstBlockedSample, freeCells, gridFromAscii, lcg } from './helpers'

describe('hasLineOfSight', () => {
  const grid = gridFromAscii([
    '......',
    '..#...',
    '......',
    '......',
  ])
  const c = (col: number, row: number) => grid.toWorld(col, row)

  it('is true across open floor and false through a blocked cell', () => {
    expect(hasLineOfSight(grid, c(0, 3), c(5, 3))).toBe(true)
    expect(hasLineOfSight(grid, c(0, 1), c(5, 1))).toBe(false)
    expect(hasLineOfSight(grid, c(2, 0), c(2, 3))).toBe(false)
    expect(hasLineOfSight(grid, c(5, 1), c(0, 1))).toBe(false)
  })

  it('is false from, to or through blocked or outside cells', () => {
    expect(hasLineOfSight(grid, c(2, 1), c(0, 0))).toBe(false)
    expect(hasLineOfSight(grid, c(0, 0), c(2, 1))).toBe(false)
    expect(hasLineOfSight(grid, c(0, 0), { x: -1, z: 0.25 })).toBe(false)
  })

  it('does not slip diagonally past a blocked corner', () => {
    // exactly through the corner shared by (1,0),(2,0),(1,1),(2,1)
    expect(hasLineOfSight(grid, c(1, 0), { x: 1.25, z: 0.75 })).toBe(false)
    expect(hasLineOfSight(grid, c(1, 2), c(3, 0))).toBe(false)
  })

  it('keeps a walker-width margin: grazing an obstacle closer than 0.2 m fails', () => {
    // row 2 runs just under the block; 0.1 m below its edge is too close, the row centre is fine
    expect(hasLineOfSight(grid, { x: 0.25, z: 1.1 }, { x: 2.75, z: 1.1 })).toBe(false)
    expect(hasLineOfSight(grid, { x: 0.25, z: 1.25 }, { x: 2.75, z: 1.25 })).toBe(true)
  })

  it('a point sees itself', () => {
    expect(hasLineOfSight(grid, c(0, 0), c(0, 0))).toBe(true)
  })
})

describe('smoothPath (P04-T02)', () => {
  it('collapses a staircase on open floor into one segment', () => {
    const grid = gridFromAscii(['......', '......', '......', '......'])
    const cells = findPath(grid, [0, 0], [5, 2])!
    const pts = cells.map(([col, row]) => grid.toWorld(col, row))
    expect(smoothPath(grid, pts)).toEqual([grid.toWorld(0, 0), grid.toWorld(5, 2)])
  })

  it('keeps the corner needed to go round an obstacle', () => {
    const grid = gridFromAscii([
      '.......',
      '...#...',
      '...#...',
      '...#...',
      '.......',
    ])
    const cells = findPath(grid, [1, 2], [5, 2])!
    const out = smoothPath(grid, cells.map(([col, row]) => grid.toWorld(col, row)))
    expect(out[0]).toEqual(grid.toWorld(1, 2))
    expect(out[out.length - 1]).toEqual(grid.toWorld(5, 2))
    expect(out.length).toBeGreaterThan(2)
    expect(out.length).toBeLessThan(cells.length)
    expect(firstBlockedSample(grid, out)).toBeNull()
  })

  it('passes short inputs through as copies', () => {
    const grid = gridFromAscii(['...'])
    const pts = [grid.toWorld(0, 0), grid.toWorld(2, 0)]
    const out = smoothPath(grid, pts)
    expect(out).toEqual(pts)
    expect(out[0]).not.toBe(pts[0])
    expect(smoothPath(grid, [])).toEqual([])
  })

  it('never crosses a blocked cell on the real floors (sampled every 0.1 m), and never gets longer', () => {
    const rnd = lcg(99)
    for (const floor of allTestFloors()) {
      const grid = buildGrid(floor)
      const free = freeCells(grid)
      for (let i = 0; i < 150; i += 1) {
        const from = free[Math.floor(rnd() * free.length)]!
        const to = free[Math.floor(rnd() * free.length)]!
        const pts = findPath(grid, from, to)!.map(([col, row]) => grid.toWorld(col, row))
        const out = smoothPath(grid, pts)
        expect(firstBlockedSample(grid, out), `${floor.key} ${from} → ${to}`).toBeNull()
        expect(out[0]).toEqual(pts[0])
        expect(out[out.length - 1]).toEqual(pts[pts.length - 1])
        expect(out.length).toBeLessThanOrEqual(pts.length)
        const len = (p: typeof pts) =>
          p.reduce((s, q, k) => (k === 0 ? 0 : s + Math.hypot(q.x - p[k - 1]!.x, q.z - p[k - 1]!.z)), 0)
        expect(len(out)).toBeLessThanOrEqual(len(pts) + 1e-9)
      }
    }
  })
})

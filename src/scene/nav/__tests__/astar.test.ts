import { describe, expect, it } from 'vitest'
import { findPath } from '../astar'
import { buildGrid } from '../grid'
import type { Cell } from '../types'
import { allTestFloors, freeCells, gridFromAscii, lcg } from './helpers'

function cost(path: readonly Cell[]): number {
  let total = 0
  for (let i = 1; i < path.length; i += 1) {
    const dc = Math.abs(path[i]![0] - path[i - 1]![0])
    const dr = Math.abs(path[i]![1] - path[i - 1]![1])
    expect(Math.max(dc, dr)).toBe(1)
    total += dc + dr === 2 ? Math.SQRT2 : 1
  }
  return total
}

describe('findPath (P04-T02)', () => {
  it('straight and diagonal lines on an empty grid', () => {
    const grid = gridFromAscii(['.....', '.....', '.....', '.....', '.....'])
    expect(findPath(grid, [0, 0], [4, 0])).toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]])
    expect(findPath(grid, [0, 0], [3, 3])).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]])
    expect(cost(findPath(grid, [0, 0], [4, 2])!)).toBeCloseTo(2 + 2 * Math.SQRT2, 9)
    expect(findPath(grid, [2, 2], [2, 2])).toEqual([[2, 2]])
  })

  it('goes round a wall by the shorter side', () => {
    const grid = gridFromAscii([
      '.......',
      '...#...',
      '...#...',
      '...#...',
      '...#...',
      '...#...',
      '.......',
    ])
    const path = findPath(grid, [1, 1], [5, 1])!
    for (const [col, row] of path) expect(grid.isBlocked(col, row)).toBe(false)
    // over the top: (1,1) → (2,0) → (3,0) → (4,0) → (5,1)
    expect(cost(path)).toBeCloseTo(2 + 2 * Math.SQRT2, 9)
    expect(path.some(([, row]) => row === 0)).toBe(true)
  })

  it('matches a brute-force shortest distance on random grids', () => {
    const rnd = lcg(7)
    for (let round = 0; round < 30; round += 1) {
      const w = 12
      const h = 9
      const rows: string[] = []
      for (let r = 0; r < h; r += 1) {
        let line = ''
        for (let c = 0; c < w; c += 1) line += rnd() < 0.28 ? '#' : '.'
        rows.push(line)
      }
      const grid = gridFromAscii(rows)
      const free = freeCells(grid)
      const from = free[Math.floor(rnd() * free.length)]!
      const to = free[Math.floor(rnd() * free.length)]!
      // Bellman-Ford style relaxation with the same move rules
      const dist = new Float64Array(w * h).fill(Infinity)
      dist[from[1] * w + from[0]] = 0
      let changed = true
      while (changed) {
        changed = false
        for (const [c, r] of free) {
          const d = dist[r * w + c]!
          if (d === Infinity) continue
          for (let dr = -1; dr <= 1; dr += 1) {
            for (let dc = -1; dc <= 1; dc += 1) {
              if (dc === 0 && dr === 0) continue
              if (grid.isBlocked(c + dc, r + dr)) continue
              if (dc !== 0 && dr !== 0 && (grid.isBlocked(c + dc, r) || grid.isBlocked(c, r + dr))) continue
              const nd = d + (dc !== 0 && dr !== 0 ? Math.SQRT2 : 1)
              const ni = (r + dr) * w + c + dc
              if (nd < dist[ni]! - 1e-12) {
                dist[ni] = nd
                changed = true
              }
            }
          }
        }
      }
      const expected = dist[to[1] * w + to[0]]!
      const path = findPath(grid, from, to)
      if (expected === Infinity) {
        expect(path).toBeNull()
      } else {
        expect(path![0]).toEqual(from)
        expect(path![path!.length - 1]).toEqual(to)
        expect(cost(path!)).toBeCloseTo(expected, 9)
      }
    }
  })

  it('never moves diagonally past a blocked corner', () => {
    const grid = gridFromAscii(['.#.', '...', '...'])
    // (0,0) → (1,1) would squeeze past the blocked (1,0): step down first
    expect(findPath(grid, [0, 0], [1, 1])).toEqual([[0, 0], [0, 1], [1, 1]])

    const pinch = gridFromAscii(['.#', '#.'])
    expect(findPath(pinch, [0, 0], [1, 1])).toBeNull()

    const rnd = lcg(11)
    for (const floor of allTestFloors().slice(0, 3)) {
      const real = buildGrid(floor)
      const free = freeCells(real)
      for (let i = 0; i < 50; i += 1) {
        const path = findPath(real, free[Math.floor(rnd() * free.length)]!, free[Math.floor(rnd() * free.length)]!)!
        for (let k = 1; k < path.length; k += 1) {
          const [c0, r0] = path[k - 1]!
          const [c1, r1] = path[k]!
          expect(real.isBlocked(c1, r1)).toBe(false)
          if (c0 !== c1 && r0 !== r1) {
            expect(real.isBlocked(c1, r0)).toBe(false)
            expect(real.isBlocked(c0, r1)).toBe(false)
          }
        }
      }
    }
  })

  it('returns null when unreachable or an end is blocked or outside', () => {
    const grid = gridFromAscii(['..#..', '..#..', '..#..'])
    expect(findPath(grid, [0, 0], [4, 2])).toBeNull()
    expect(findPath(grid, [0, 0], [2, 1])).toBeNull()
    expect(findPath(grid, [2, 1], [0, 0])).toBeNull()
    expect(findPath(grid, [0, 0], [9, 9])).toBeNull()
    // a failed search must not poison the next one
    expect(findPath(grid, [0, 0], [1, 2])).toHaveLength(3)
  })

  it('is deterministic: same input, same path, whatever ran before', () => {
    const grid = buildGrid(allTestFloors()[1]!)
    const free = freeCells(grid)
    const rnd = lcg(3)
    const pairs = Array.from({ length: 40 }, () => [
      free[Math.floor(rnd() * free.length)]!,
      free[Math.floor(rnd() * free.length)]!,
    ] as const)
    const first = pairs.map(([a, b]) => findPath(grid, a, b))
    const second = [...pairs].reverse().map(([a, b]) => findPath(grid, a, b)).reverse()
    expect(second).toEqual(first)
  })

  it('finds 1 000 random paths on a 48 × 28 floor quickly', () => {
    const grid = buildGrid(allTestFloors().find((f) => f.key === 'dept_full')!)
    expect([grid.w, grid.h]).toEqual([48, 28])
    const free = freeCells(grid)
    const rnd = lcg(42)
    const pairs = Array.from({ length: 1000 }, () => [
      free[Math.floor(rnd() * free.length)]!,
      free[Math.floor(rnd() * free.length)]!,
    ] as const)
    for (let i = 0; i < 100; i += 1) findPath(grid, pairs[i]![0], pairs[i]![1]) // warm up
    const t0 = performance.now()
    let found = 0
    for (const [a, b] of pairs) {
      if (findPath(grid, a, b)) found += 1
    }
    const ms = performance.now() - t0
    expect(found).toBe(1000)
    // target 150 ms; ×3 headroom for noisy CI runners
    expect(ms).toBeLessThan(450)
  })
})

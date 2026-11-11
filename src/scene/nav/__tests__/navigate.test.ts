import { describe, expect, it } from 'vitest'
import { approachPoint, buildGrid } from '../grid'
import { PathCache, navigate, pathLength } from '../navigate'
import type { Vec2 } from '../types'
import { allTestFloors, firstBlockedSample, gridFromAscii, lcg } from './helpers'

const floors = allTestFloors()

describe('navigate', () => {
  it('starts and ends on the exact points', () => {
    const grid = gridFromAscii(['......', '......', '......'])
    const from = { x: 0.1, z: 0.4 }
    const to = { x: 2.9, z: 1.3 }
    const path = navigate(grid, from, to)!
    expect(path[0]).toEqual(from)
    expect(path[path.length - 1]).toEqual(to)
    expect(path).toHaveLength(2)
    expect(path[0]).not.toBe(from)
  })

  it('handles both points in one cell', () => {
    const grid = gridFromAscii(['...'])
    expect(navigate(grid, { x: 0.6, z: 0.1 }, { x: 0.9, z: 0.4 })).toEqual([
      { x: 0.6, z: 0.1 },
      { x: 0.9, z: 0.4 },
    ])
  })

  it('snaps an end inside a blocked cell to the nearest free cell but keeps the exact point', () => {
    const grid = gridFromAscii([
      '......',
      '.##...',
      '......',
    ])
    const seat = { x: 0.6, z: 0.75 } // inside the block, nearest free cell is (0,1)
    const to = { x: 2.75, z: 1.25 }
    const path = navigate(grid, seat, to)!
    expect(path[0]).toEqual(seat)
    expect(path[1]).toEqual(grid.toWorld(0, 1))
    expect(path[path.length - 1]).toEqual(to)
    // everything after the hop off the seat is clear
    expect(firstBlockedSample(grid, path.slice(1))).toBeNull()

    const back = navigate(grid, to, seat)!
    expect(back[0]).toEqual(to)
    expect(back[back.length - 2]).toEqual(grid.toWorld(0, 1))
    expect(back[back.length - 1]).toEqual(seat)
  })

  it('returns null when unreachable or when no free cell is near an end', () => {
    const split = gridFromAscii(['..#..', '..#..'])
    expect(navigate(split, { x: 0.25, z: 0.25 }, { x: 2.25, z: 0.25 })).toBeNull()
    const solid = gridFromAscii(['#########.', '#########.'])
    expect(navigate(solid, { x: 0.25, z: 0.25 }, { x: 4.75, z: 0.25 })).toBeNull()
  })

  it('on every real floor: slot-to-slot routes exist, are clear and deterministic', () => {
    const rnd = lcg(5)
    for (const floor of floors) {
      const grid = buildGrid(floor)
      const door = approachPoint(floor.elevatorDoorSlots[0]!)
      for (const slot of floor.slots) {
        const target = approachPoint(slot)
        const path = navigate(grid, door, target)
        expect(path, `${floor.key}/${slot.id}`).not.toBeNull()
        expect(path![0]).toEqual(door)
        expect(path![path!.length - 1]).toEqual(target)
        expect(firstBlockedSample(grid, path!), `${floor.key}/${slot.id}`).toBeNull()
        expect(navigate(grid, door, target)).toEqual(path)
      }
      // seats inside furniture: the person sits at the slot origin
      for (let i = 0; i < 40; i += 1) {
        const a = floor.slots[Math.floor(rnd() * floor.slots.length)]!
        const b = floor.slots[Math.floor(rnd() * floor.slots.length)]!
        const from = { x: a.x, z: a.z }
        const to = { x: b.x, z: b.z }
        const path = navigate(grid, from, to)
        expect(path, `${floor.key} ${a.id} → ${b.id}`).not.toBeNull()
        expect(path![0]).toEqual(from)
        expect(path![path!.length - 1]).toEqual(to)
        // only the first and last hop may touch blocked cells
        if (path!.length > 3) {
          expect(firstBlockedSample(grid, path!.slice(1, -1))).toBeNull()
        }
      }
    }
  })
})

describe('pathLength', () => {
  it('sums segment lengths', () => {
    expect(pathLength([])).toBe(0)
    expect(pathLength([{ x: 1, z: 1 }])).toBe(0)
    expect(
      pathLength([
        { x: 0, z: 0 },
        { x: 3, z: 4 },
        { x: 3, z: 6 },
      ]),
    ).toBe(7)
  })
})

describe('PathCache', () => {
  const grid = buildGrid(floors[1]!)
  const other = buildGrid(floors[0]!)
  const a: Vec2 = { x: 20.25, z: 9.25 }
  const b: Vec2 = { x: 8.3, z: 3.6 }

  it('returns the same result as navigate, hit or miss', () => {
    const cache = new PathCache()
    const miss = cache.navigate(grid, a, b)
    const hit = cache.navigate(grid, a, b)
    expect(miss).toEqual(navigate(grid, a, b))
    expect(hit).toEqual(miss)
    expect(hit).not.toBe(miss)
    expect(cache.size).toBe(1)
    // another exact point in the same cells reuses the entry but keeps its own ends
    const b2 = { x: b.x + 0.1, z: b.z + 0.05 }
    const again = cache.navigate(grid, a, b2)!
    expect(cache.size).toBe(1)
    expect(again[again.length - 1]).toEqual(b2)
    expect(again).toEqual(navigate(grid, a, b2))
  })

  it('keys by floor, caches null, and clears', () => {
    const cache = new PathCache()
    cache.navigate(grid, a, b)
    cache.navigate(other, a, b)
    expect(cache.size).toBe(2)
    const split = gridFromAscii(['..#..', '..#..'], 'split')
    expect(cache.navigate(split, { x: 0.25, z: 0.25 }, { x: 2.25, z: 0.25 })).toBeNull()
    expect(cache.navigate(split, { x: 0.25, z: 0.25 }, { x: 2.25, z: 0.25 })).toBeNull()
    expect(cache.size).toBe(3)
    cache.clear()
    expect(cache.size).toBe(0)
  })

  it('evicts the least recently used entry beyond its capacity', () => {
    const cache = new PathCache(2)
    const p = (col: number): Vec2 => ({ x: col * 0.5 + 0.25, z: 0.25 })
    const open = gridFromAscii(['........'], 'open')
    cache.navigate(open, p(0), p(1)) // A
    cache.navigate(open, p(0), p(2)) // B
    cache.navigate(open, p(0), p(1)) // touch A
    cache.navigate(open, p(0), p(3)) // C evicts B
    expect(cache.size).toBe(2)
    cache.navigate(open, p(0), p(1)) // still cached
    expect(cache.size).toBe(2)
    cache.navigate(open, p(0), p(2)) // B again: evicts C
    expect(cache.size).toBe(2)
    expect(new PathCache().size).toBe(0)
  })
})

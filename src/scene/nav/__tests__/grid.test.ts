import { describe, expect, it } from 'vitest'
import { slotBlocksFloor } from '@/scene/layout'
import {
  approachCell,
  approachPoint,
  buildGrid,
  cellCenter,
  nearestFreeCell,
} from '../grid'
import { allTestFloors, floodFill, gridFromAscii } from './helpers'

const floors = allTestFloors()
const byKey = (key: string) => floors.find((f) => f.key === key)!

describe('buildGrid on the real floors (P04-T01)', () => {
  it('covers every template', () => {
    expect(new Set(floors.map((f) => f.templateKey))).toEqual(
      new Set(['lobby_cafe', 'department', 'games_rest', 'management', 'boss']),
    )
    expect(byKey('dept_full').slots.filter((s) => s.type === 'desk')).toHaveLength(16)
  })

  it.each(floors.map((f) => [f.key, f] as const))('%s: grid is 48 × 28 cells of 0.5 m', (_k, floor) => {
    const grid = buildGrid(floor)
    expect([grid.w, grid.h, grid.cell]).toEqual([48, 28, 0.5])
    expect(grid.blocked).toHaveLength(48 * 28)
    expect(grid.floorKey).toBe(floor.key)
  })

  it.each(floors.map((f) => [f.key, f] as const))(
    '%s: every approach cell is free and reachable from the elevator and the stairs',
    (_k, floor) => {
      const grid = buildGrid(floor)
      const door = floor.slots.find((s) => s.id === 'elevator_door_1')!
      const fromDoor = floodFill(grid, approachCell(door))
      const fromStairs = floodFill(grid, approachCell(floor.stairsEntrySlot))
      const bad: string[] = []
      for (const slot of floor.slots) {
        const [col, row] = approachCell(slot)
        const idx = row * grid.w + col
        if (grid.isBlocked(col, row)) bad.push(`${slot.id}: approach blocked`)
        else if (fromDoor[idx] !== 1) bad.push(`${slot.id}: not reachable from elevator`)
        else if (fromStairs[idx] !== 1) bad.push(`${slot.id}: not reachable from stairs`)
      }
      expect(bad).toEqual([])
    },
  )

  it.each(floors.map((f) => [f.key, f] as const))(
    '%s: all free cells form one connected area (no pockets)',
    (_k, floor) => {
      const grid = buildGrid(floor)
      const reach = floodFill(grid, approachCell(floor.elevatorDoorSlots[0]!))
      let stranded = 0
      for (let i = 0; i < grid.blocked.length; i += 1) {
        if (grid.blocked[i] === 0 && reach[i] === 0) stranded += 1
      }
      expect(stranded).toBe(0)
    },
  )

  it.each(floors.map((f) => [f.key, f] as const))(
    '%s: furniture footprints are blocked, spots are not',
    (_k, floor) => {
      const grid = buildGrid(floor)
      const approaches = new Set(floor.slots.map((s) => approachCell(s).join(',')))
      for (const slot of floor.slots) {
        if (!slotBlocksFloor(slot.type)) continue
        for (const [col, row] of slot.footprint ?? []) {
          if (approaches.has(`${col},${row}`)) continue
          expect(grid.isBlocked(col, row), `${slot.id} footprint ${col},${row}`).toBe(true)
        }
      }
    },
  )

  it('desk tops are blocked and the gap between facing desks is not an aisle', () => {
    const floor = byKey('dept_full')
    const grid = buildGrid(floor)
    const desks = floor.slots.filter((s) => s.type === 'desk')
    for (const desk of desks) {
      const [col, row] = grid.toCell({ x: desk.x, z: desk.z })
      expect(grid.isBlocked(col, row), desk.id).toBe(true)
    }
    // desk_1 (front row) and desk_3 (facing it): every cell between them is blocked
    const a = desks.find((d) => d.id === 'desk_1')!
    const b = desks.find((d) => d.id === 'desk_3')!
    expect(a.x).toBe(b.x)
    for (let z = a.z; z <= b.z; z += 0.25) {
      const [col, row] = grid.toCell({ x: a.x, z })
      expect(grid.isBlocked(col, row)).toBe(true)
    }
  })

  it('walls block and door gaps stay open, at least 2 cells wide', () => {
    for (const floor of floors) {
      const grid = buildGrid(floor)
      for (const wall of floor.walls) {
        const len = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1)
        const ux = (wall.x2 - wall.x1) / len
        const uz = (wall.z2 - wall.z1) / len
        // sample 0.25 m to each side of the wall line, at cell-centre spacing
        let openRun = 0
        let bestRun = 0
        for (let t = 0.25; t < len; t += 0.5) {
          const inDoor = !!wall.door && t > wall.door.offset && t < wall.door.offset + wall.door.width
          let sidesOpen = 0
          let sidesInside = 0
          for (const side of [-0.25, 0.25]) {
            const x = wall.x1 + ux * t - uz * side
            const z = wall.z1 + uz * t + ux * side
            if (x < 0 || z < 0 || x >= floor.size.w || z >= floor.size.d) continue
            sidesInside += 1
            if (!grid.isBlocked(Math.floor(x / 0.5), Math.floor(z / 0.5))) sidesOpen += 1
          }
          if (inDoor) {
            expect(sidesOpen, `${floor.key} door at t=${t}`).toBe(sidesInside)
            openRun += 1
            bestRun = Math.max(bestRun, openRun)
          } else {
            expect(sidesOpen, `${floor.key} wall (${wall.x1},${wall.z1}) t=${t}`).toBe(0)
            openRun = 0
          }
        }
        if (wall.door) expect(bestRun).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('interior doors connect the two sides of their wall', () => {
    // department: private office (west of x = 5) ↔ open floor
    const grid = buildGrid(byKey('cs'))
    const reach = floodFill(grid, [3, 20])
    expect(grid.isBlocked(3, 20)).toBe(false)
    expect(reach[20 * grid.w + 20]).toBe(1)
  })

  it('the core east of the door line is blocked; door and stairs approaches are not', () => {
    for (const floor of floors) {
      const grid = buildGrid(floor)
      for (const door of floor.elevatorDoorSlots) {
        const [col, row] = approachCell(door)
        expect(grid.isBlocked(col, row)).toBe(false)
        for (let c = col + 1; c < grid.w; c += 1) expect(grid.isBlocked(c, row)).toBe(true)
      }
      const [sc, sr] = approachCell(floor.stairsEntrySlot)
      expect(grid.isBlocked(sc, sr)).toBe(false)
      for (let c = sc + 1; c < grid.w; c += 1) expect(grid.isBlocked(c, sr)).toBe(true)
    }
  })

  it('is deterministic', () => {
    for (const floor of floors) {
      expect(Array.from(buildGrid(floor).blocked)).toEqual(Array.from(buildGrid(floor).blocked))
    }
  })

  it('builds a floor in under 5 ms on average', () => {
    for (const floor of floors) buildGrid(floor) // warm up
    const rounds = 20
    const t0 = performance.now()
    for (let i = 0; i < rounds; i += 1) {
      for (const floor of floors) buildGrid(floor)
    }
    const perFloor = (performance.now() - t0) / (rounds * floors.length)
    expect(perFloor).toBeLessThan(5)
  })
})

describe('grid helpers', () => {
  const grid = gridFromAscii([
    '......',
    '.###..',
    '.###..',
    '.###..',
    '......',
  ])

  it('isBlocked treats out of bounds as blocked; toCell/toWorld round-trip', () => {
    expect(grid.isBlocked(-1, 0)).toBe(true)
    expect(grid.isBlocked(6, 0)).toBe(true)
    expect(grid.isBlocked(0, 5)).toBe(true)
    expect(grid.isBlocked(2, 2)).toBe(true)
    expect(grid.isBlocked(0, 0)).toBe(false)
    expect(grid.toCell({ x: 1.3, z: 0.7 })).toEqual([2, 1])
    expect(grid.toWorld(2, 1)).toEqual({ x: 1.25, z: 0.75 })
    expect(grid.toCell({ x: 3, z: 2.5 })).toEqual([5, 4]) // on the far edge: clamped
  })

  it('cellCenter and approachPoint', () => {
    expect(cellCenter([40, 18])).toEqual({ x: 20.25, z: 9.25 })
    expect(
      approachPoint({ id: 's', type: 'desk', x: 8.2, z: 4.2, rotY: 0, approach: [16, 7] }),
    ).toEqual({ x: 8.25, z: 3.75 })
    expect(approachPoint({ id: 's', type: 'idle_chat', x: 8.2, z: 4.2, rotY: 0 })).toEqual({
      x: 8.25,
      z: 4.25,
    })
  })

  it('nearestFreeCell: own cell when free, closest free cell otherwise, null beyond the radius', () => {
    expect(nearestFreeCell(grid, { x: 0.2, z: 0.2 })).toEqual([0, 0])
    // inside the block, nearer its west edge
    expect(nearestFreeCell(grid, { x: 0.6, z: 1.25 })).toEqual([0, 2])
    // centre of the block, a touch towards the east
    expect(nearestFreeCell(grid, { x: 1.3, z: 1.25 })).toEqual([4, 2])
    // exact tie (centre cell): lower row wins
    expect(nearestFreeCell(grid, { x: 1.25, z: 1.25 })).toEqual([2, 0])
    expect(nearestFreeCell(grid, { x: 1.25, z: 1.25 }, 1)).toBeNull()
  })
})

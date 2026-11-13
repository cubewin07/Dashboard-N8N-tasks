import { describe, expect, it } from 'vitest'
import { benchOf, linePoint, nearestFree } from '@/scene/director/seating'
import { stationFor } from '@/scene/director/stations'
import manifestJson from '../../../../public/assets/manifest.json'
import { enrichFloorLayout } from '../../render/assets/floorArt'
import { FURNITURE_MAP } from '../../render/assets/furnitureMap'
import { AssetManifestSchema } from '../../render/assets/manifest'
import { approachCell, buildGrid } from '../grid'
import { allTestFloors, floodFill } from './helpers'

const manifest = AssetManifestSchema.parse(manifestJson)
const floors = allTestFloors()

describe('Grid reachability with real art data (P06b-T08)', () => {
  it('covers all floor templates', () => {
    const keys = new Set(floors.map((f) => f.templateKey))
    expect(keys).toEqual(
      new Set(['lobby_cafe', 'department', 'games_rest', 'management', 'boss']),
    )
  })

  it.each(floors.map((f) => [f.key, f] as const))(
    '%s: every seat, queue point, elevator, and stairs is reachable from the elevator door',
    (_key, rawFloor) => {
      const floor = enrichFloorLayout(rawFloor, FURNITURE_MAP, manifest)
      const grid = buildGrid(floor)

      const door = floor.elevatorDoorSlots[0]
      expect(door, `${floor.key} has an elevator door`).toBeDefined()
      if (!door) return

      const doorCell = approachCell(door, grid.cell)
      expect(grid.isBlocked(doorCell[0], doorCell[1]), `${floor.key} elevator door cell free`).toBe(false)

      const reach = floodFill(grid, doorCell)
      const unreachable: string[] = []

      // 1. Elevator doors
      for (const d of floor.elevatorDoorSlots) {
        const [c, r] = approachCell(d, grid.cell)
        if (reach[r * grid.w + c] !== 1) {
          unreachable.push(`elevator door ${d.id} at [${c},${r}]`)
        }
      }

      // 2. Stairs entry
      if (floor.stairsEntrySlot) {
        const [c, r] = approachCell(floor.stairsEntrySlot, grid.cell)
        if (reach[r * grid.w + c] !== 1) {
          unreachable.push(`stairs entry at [${c},${r}]`)
        }
      }

      // 3. Every slot approach
      for (const slot of floor.slots) {
        const [c, r] = approachCell(slot, grid.cell)
        if (reach[r * grid.w + c] !== 1) {
          unreachable.push(`slot approach ${slot.id} (${slot.type}) at [${c},${r}]`)
        }
      }

      // 4. Every seat from art data
      if (floor.art?.seats) {
        for (const [slotId, slotSeats] of Object.entries(floor.art.seats)) {
          slotSeats.forEach((seat, idx) => {
            const col = Math.floor(seat.x / grid.cell)
            const row = Math.floor(seat.z / grid.cell)
            if (reach[row * grid.w + col] !== 1) {
              unreachable.push(`seat ${slotId}#${idx} at (${seat.x.toFixed(2)},${seat.z.toFixed(2)}) [${col},${row}]`)
            }
          })
        }
      }

      // 5. Queue points (waiting bench seats and standing line)
      const bench = benchOf(floor)
      if (bench) {
        bench.seats.forEach((station, idx) => {
          const col = Math.floor(station.seat.x / grid.cell)
          const row = Math.floor(station.seat.z / grid.cell)
          if (reach[row * grid.w + col] !== 1) {
            unreachable.push(`bench seat #${idx} at [${col},${row}]`)
          }
        })

        // Check standing line points
        for (let k = 0; k < 4; k += 1) {
          const rawPoint = linePoint(bench.origin, bench.dir, k)
          const pt = nearestFree(grid, rawPoint)
          const col = Math.floor(pt.x / grid.cell)
          const row = Math.floor(pt.z / grid.cell)
          if (reach[row * grid.w + col] !== 1) {
            unreachable.push(`bench line #${k} at [${col},${row}]`)
          }
        }
      }

      // 6. Station seat for every slot
      for (const slot of floor.slots) {
        const count = Math.max(1, floor.art?.seats?.[slot.id]?.length ?? 1)
        for (let idx = 0; idx < count; idx += 1) {
          const st = stationFor(floor, slot, idx)
          const [col, row] = grid.toCell(st.seat)
          if (reach[row * grid.w + col] !== 1) {
            unreachable.push(`station ${slot.id}#${idx} seat at [${col},${row}]`)
          }
        }
      }

      // 7. No stranded free cells (all free cells form one connected area)
      let stranded = 0
      for (let i = 0; i < grid.blocked.length; i += 1) {
        if (grid.blocked[i] === 0 && reach[i] === 0) stranded += 1
      }
      expect(stranded, `${floor.key} stranded free cells`).toBe(0)

      expect(unreachable).toEqual([])
    },
  )

  it('dept_full with art data keeps desk tops and facing-desk gaps blocked', () => {
    const raw = floors.find((f) => f.key === 'dept_full')!
    const floor = enrichFloorLayout(raw, FURNITURE_MAP, manifest)
    const grid = buildGrid(floor)
    const desks = floor.slots.filter((s) => s.type === 'desk')
    for (const desk of desks) {
      const [col, row] = grid.toCell({ x: desk.x, z: desk.z })
      expect(grid.isBlocked(col, row), desk.id).toBe(true)
    }
    const a = desks.find((d) => d.id === 'desk_1')!
    const b = desks.find((d) => d.id === 'desk_3')!
    expect(a.x).toBe(b.x)
    for (let z = a.z; z <= b.z; z += 0.25) {
      const [col, row] = grid.toCell({ x: a.x, z })
      expect(grid.isBlocked(col, row)).toBe(true)
    }
  })
})

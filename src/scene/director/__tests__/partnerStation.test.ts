import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { EmployeeId } from '@/domain/primitives'
import { buildGrid } from '@/scene/nav/grid'
import { buildBuildingLayout } from '@/scene/layout'
import { partnerStation } from '../planner'
import { SlotLedger } from '../slots'
import { isStandSlot } from '../stations'

const layout = buildBuildingLayout(makeSeedConfig())

function standSlots() {
  const out: Array<{ floor: (typeof layout.floors)[number]; slot: (typeof layout.floors)[number]['slots'][number] }> = []
  for (const floor of layout.floors) {
    for (const slot of floor.slots) {
      if (isStandSlot(slot) && (slot.type === 'idle_chat' || slot.type === 'idle_water')) {
        out.push({ floor, slot })
      }
    }
  }
  return out
}

describe('partnerStation', () => {
  it('never puts two people of one standing spot on the same cell', () => {
    const spots = standSlots()
    expect(spots.length).toBeGreaterThan(0)
    for (const { floor, slot } of spots) {
      const grid = buildGrid(floor)
      const cells = new Set<string>()
      for (let place = 1; place <= 3; place += 1) {
        const st = partnerStation(floor, grid, slot, place)
        const [col, row] = grid.toCell(st.approach)
        const key = `${col},${row}`
        expect(cells.has(key), `${floor.key}/${slot.id} place ${place}`).toBe(false)
        cells.add(key)
      }
    }
  })
})

describe('SlotLedger.reserve', () => {
  it('reports a full spot instead of handing out place 0 twice', () => {
    const ledger = new SlotLedger()
    expect(ledger.reserve('f::s', 'a' as EmployeeId, 1)).toBe(0)
    expect(ledger.reserve('f::s', 'b' as EmployeeId, 1)).toBe(-1)
  })
})

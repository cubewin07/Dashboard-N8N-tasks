import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { buildBuildingLayout } from '@/scene/layout'
import { pileAnchors, pileInstances, pileOwnerIds, sheetJitter } from '../pileModel'

describe('pileInstances (P05-T05)', () => {
  it('caps the sheets at maxSheets while the label keeps counting', () => {
    expect(pileInstances(45, 0, 30)).toEqual({ sheets: 30, label: '45' })
  })

  it('lags the domain count by the papers still in transit', () => {
    expect(pileInstances(3, 1, 30)).toEqual({ sheets: 2, label: '2' })
    expect(pileInstances(1, 1, 30)).toEqual({ sheets: 0, label: '' })
    expect(pileInstances(0, 2, 30)).toEqual({ sheets: 0, label: '' })
  })
})

describe('sheetJitter', () => {
  it('is deterministic per pile and small', () => {
    const a = sheetJitter('emp_a', 30)
    expect(a).toEqual(sheetJitter('emp_a', 30))
    expect(a).not.toEqual(sheetJitter('emp_b', 30))
    expect(a).toHaveLength(30)
    for (const s of a) {
      expect(Math.abs(s.dx)).toBeLessThanOrEqual(0.012)
      expect(Math.abs(s.dz)).toBeLessThanOrEqual(0.012)
      expect(Math.abs(s.rotY)).toBeLessThanOrEqual(0.07)
    }
  })
})

describe('pileOwnerIds / pileAnchors', () => {
  it('gives every approver and owner a pile at their desk anchor', () => {
    const config = makeSeedConfig()
    const roles = new Map(config.roles.map((r) => [r.key, r]))
    const ids = pileOwnerIds(config)
    const expected = config.employees.filter((e) => {
      const caps = roles.get(e.roleKey)?.caps
      return e.state === 'active' && caps && (caps.approveLevel != null || caps.humanOwner)
    })
    expect(ids).toEqual(expected.map((e) => e.id))
    expect(ids.length).toBeGreaterThan(0)

    const layout = buildBuildingLayout(config)
    const anchors = pileAnchors(layout, ids)
    expect(anchors.length).toBe(ids.filter((id) => layout.seatOf[id]).length)
    for (const a of anchors) {
      const seat = layout.seatOf[a.employeeId]!
      const floor = layout.floors[a.floorIndex]!
      expect(floor.key).toBe(seat.floorKey)
      const slot = floor.slots.find((s) => s.id === `${seat.slotId}.pile`)!
      expect([a.x, a.z]).toEqual([slot.x, slot.z])
    }
  })
})

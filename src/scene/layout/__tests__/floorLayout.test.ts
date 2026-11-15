import { describe, expect, it } from 'vitest'
import { DEFAULT_FLOOR_TEMPLATES, makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { Employee } from '@/domain/config'
import type { EmployeeId } from '@/domain/primitives'
import { computeBuildingLayout } from '../buildingLayout'
import {
  buildFloorSlots,
  generateDeskClusterSlots,
  generatePileAnchorSlots,
} from '../floorLayout'

describe('floorLayout desk cluster and pile anchor generation', () => {
  const deptTemplate = DEFAULT_FLOOR_TEMPLATES.find((t) => t.key === 'department')!
  const lobbyTemplate = DEFAULT_FLOOR_TEMPLATES.find((t) => t.key === 'lobby_cafe')!

  it('returns no generated desks for templates without a deskArea', () => {
    expect(generateDeskClusterSlots(lobbyTemplate, 10)).toEqual([])
  })

  it('places all generated desks inside deskArea.rect with no overlaps and stable IDs', () => {
    const desks = generateDeskClusterSlots(deptTemplate, 16, 0)
    expect(desks).toHaveLength(16)
    expect(desks.map((d) => d.id)).toEqual(
      Array.from({ length: 16 }, (_, i) => `desk_${i + 1}`),
    )

    const rect = deptTemplate.deskArea!.rect
    for (let i = 0; i < desks.length; i += 1) {
      const desk = desks[i]!
      expect(desk.x).toBeGreaterThanOrEqual(rect.x)
      expect(desk.x).toBeLessThanOrEqual(rect.x + rect.w)
      expect(desk.z).toBeGreaterThanOrEqual(rect.z)
      expect(desk.z).toBeLessThanOrEqual(rect.z + rect.d)
      expect(desk.footprint?.length).toBeGreaterThanOrEqual(1)
      expect(desk.approach).toBeDefined()

      for (let j = i + 1; j < desks.length; j += 1) {
        const other = desks[j]!
        const dist = Math.hypot(desk.x - other.x, desk.z - other.z)
        expect(dist).toBeGreaterThanOrEqual(1.0)
      }
    }
  })

  it('computes cluster count from desk worker count and annexIndex', () => {
    // Main floor (annexIndex = 0) has minimum 2 clusters (8 desks)
    expect(generateDeskClusterSlots(deptTemplate, 0, 0)).toHaveLength(8)
    expect(generateDeskClusterSlots(deptTemplate, 4, 0)).toHaveLength(8)
    expect(generateDeskClusterSlots(deptTemplate, 9, 0)).toHaveLength(12)
    expect(generateDeskClusterSlots(deptTemplate, 15, 0)).toHaveLength(16)
    // Annex floor (annexIndex > 0) has minimum 1 cluster (4 desks)
    expect(generateDeskClusterSlots(deptTemplate, 1, 1)).toHaveLength(4)
  })

  it('generates .pile child slots for every workspace desk', () => {
    const allSlots = buildFloorSlots(deptTemplate, 8, 0)
    const pileSlots = generatePileAnchorSlots(
      allSlots.filter((s) => s.type !== 'pile_anchor'),
    )
    // 1 private_office + 4 review_desk + 8 desk = 13 pile anchors
    expect(pileSlots).toHaveLength(13)
    expect(pileSlots.some((s) => s.id === 'desk_1.pile' && s.parentSlotId === 'desk_1')).toBe(
      true,
    )
    expect(
      pileSlots.some(
        (s) => s.id === 'private_office.pile' && s.parentSlotId === 'private_office',
      ),
    ).toBe(true)
  })

  it('spawns an annex floor cs#2 with 1 desk cluster when CS has 17 desk workers', () => {
    const base = makeSeedConfig()
    const nonCsDeskEmployees = base.employees.filter(
      (e) => !(e.departmentId === 'dep_cs' && e.roleKey === 'worker'),
    )
    const seventeenCsWorkers: Employee[] = Array.from({ length: 17 }, (_, i) => ({
      id: `emp_cs_worker_${i + 1}` as EmployeeId,
      name: `CS Worker ${i + 1}`,
      departmentId: 'dep_cs',
      roleKey: 'worker',
      specialties: ['customer_chat'],
      kind: 'core',
      state: 'active',
      reviewMode: 'always',
      modelTierOverride: null,
      bio: null,
      createdAt: `2026-11-10T01:${String(i).padStart(2, '0')}:00Z`,
      createdBy: 'seed',
      archivedAt: null,
    }))

    const layout = computeBuildingLayout({
      ...base,
      employees: [...nonCsDeskEmployees, ...seventeenCsWorkers],
    })

    const csMain = layout.floors.find((f) => f.key === 'cs')
    const csAnnex = layout.floors.find((f) => f.key === 'cs#2')
    expect(csMain).toBeDefined()
    expect(csAnnex).toBeDefined()
    expect(csAnnex!.index).toBe(csMain!.index + 1)
    expect(csAnnex!.annexIndex).toBe(1)
    expect(csAnnex!.label).toEqual({
      vi: 'Chăm sóc khách hàng (2)',
      en: 'Customer Support (2)',
    })
    expect(csMain!.slots.filter((s) => s.type === 'desk')).toHaveLength(16)
    expect(csAnnex!.slots.filter((s) => s.type === 'desk')).toHaveLength(4)
  })
})

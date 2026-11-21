import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { SlotTypeSchema } from '@/domain/config'
import { computeBuildingLayout } from '@/scene/layout/buildingLayout'
import manifestJson from '../../../../../public/assets/manifest.json'
import { FURNITURE_MAP, listMapModels, type FurnitureMap } from '../furnitureMap'
import { AssetManifestSchema, assetUrl } from '../manifest'
import {
  buildFurniturePlacements,
  hash01,
  pickVariant,
  resolveSlotArt,
  rotateY,
  slotsWithModels,
} from '../placements'
import { buildShellPlacements } from '../shell'

const manifest = AssetManifestSchema.parse(manifestJson)
const layout = computeBuildingLayout(makeSeedConfig())

describe('furniture-map.json (P06b R1)', () => {
  it('has an entry for every SlotType', () => {
    for (const type of SlotTypeSchema.options) {
      expect(FURNITURE_MAP.slots[type], type).toBeDefined()
    }
  })

  it('only names models that exist in manifest.json', () => {
    const missing = listMapModels(FURNITURE_MAP).filter((name) => !manifest.files[name])
    expect(missing).toEqual([])
  })

  it('only names nodes that exist in the model', () => {
    for (const art of Object.values(FURNITURE_MAP.slots)) {
      for (const ref of art.models) {
        if (ref.node) expect(manifest.files[ref.model]?.nodes).toContain(ref.node)
      }
    }
  })
})

describe('assetUrl', () => {
  it('prefixes the GitHub Pages base path', () => {
    expect(assetUrl('models/props/chair_office_01.glb', '/Dashboard-N8N-tasks/')).toBe(
      '/Dashboard-N8N-tasks/assets/models/props/chair_office_01.glb',
    )
    expect(assetUrl('/manifest.json', '/base')).toBe('/base/assets/manifest.json')
  })
})

describe('placement helpers', () => {
  it('hash01 is stable and inside [0, 1)', () => {
    expect(hash01('cs/desk_1')).toBe(hash01('cs/desk_1'))
    for (const s of ['a', 'b', 'cs/desk_1', 'boss/decor_plant_4']) {
      expect(hash01(s)).toBeGreaterThanOrEqual(0)
      expect(hash01(s)).toBeLessThan(1)
    }
  })

  it('rotateY matches three.js Y rotation', () => {
    const [x, z] = rotateY(Math.PI / 2, 0, 1)
    expect(x).toBeCloseTo(1)
    expect(z).toBeCloseTo(0)
  })

  it('pickVariant respects weights and handles an empty list', () => {
    expect(pickVariant([], 'x')).toBeNull()
    const picks = new Set<string>()
    for (let i = 0; i < 200; i += 1) {
      const pick = pickVariant(FURNITURE_MAP.slots.desk?.models ?? [], `seed-${i}`)
      if (pick) picks.add(pick.model)
    }
    expect([...picks].sort()).toEqual(['desk_standard_01', 'desk_standard_02', 'desk_standard_03'])
  })

  it('resolves by slot id, id base, type, with template overrides first', () => {
    expect(
      resolveSlotArt(FURNITURE_MAP, 'lobby_cafe', { id: 'reception_desk', type: 'decor' })?.models[0]
        ?.model,
    ).toBe('counter_reception_01')
    expect(
      resolveSlotArt(FURNITURE_MAP, 'boss', { id: 'decor_terrace_plant_2', type: 'decor' })
        ?.models[0]?.model,
    ).toBe('terrace_planter_01')
    expect(
      resolveSlotArt(FURNITURE_MAP, 'boss', { id: 'waiting_seat_3', type: 'waiting_seat' })
        ?.models[0]?.model,
    ).toBe('armchair_01')
    expect(
      resolveSlotArt(FURNITURE_MAP, 'department', { id: 'waiting_seat_3', type: 'waiting_seat' })
        ?.models[0]?.model,
    ).toBe('chair_visitor_01')
  })
})

describe('buildFurniturePlacements (P06b R10, R11)', () => {
  const placements = buildFurniturePlacements(layout, FURNITURE_MAP, manifest)

  it('is deterministic', () => {
    expect(buildFurniturePlacements(layout, FURNITURE_MAP, manifest)).toEqual(placements)
  })

  it('gives every desk a desk model and a chair on its seat anchor', () => {
    const cs = layout.floors.find((f) => f.key === 'cs')
    const desk = cs?.slots.find((s) => s.type === 'desk')
    expect(desk).toBeDefined()
    const own = placements.filter((p) => p.floorKey === 'cs' && p.slotId === desk?.id)
    const main = own.find((p) => p.primary)
    const chair = own.find((p) => p.model.startsWith('chair_office'))
    expect(main?.model).toMatch(/^desk_standard_0[123]$/)
    expect(chair).toBeDefined()
    if (!main || !chair) return
    const seat = manifest.files[main.model]?.anchors.find((a) => a.kind === 'seat')
    const dist = Math.hypot(
      chair.position[0] - main.position[0],
      chair.position[2] - main.position[2],
    )
    expect(dist).toBeCloseTo(Math.hypot(seat?.pos[0] ?? 0, seat?.pos[2] ?? 0), 2)
    expect(chair.position[1]).toBe(cs?.y)
  })

  it('seats six chairs around a department meeting table', () => {
    const chairs = placements.filter(
      (p) => p.floorKey === 'cs' && p.slotId === 'meeting_table' && !p.primary,
    )
    expect(chairs).toHaveLength(6)
  })

  it('keeps every instance inside its floor footprint', () => {
    for (const p of placements) {
      const floor = layout.floors[p.floorIndex]
      expect(floor).toBeDefined()
      if (!floor) continue
      expect(Math.abs(p.position[0]), `${p.floorKey}/${p.model}`).toBeLessThanOrEqual(
        floor.size.w / 2 + 0.01,
      )
      expect(Math.abs(p.position[2]), `${p.floorKey}/${p.model}`).toBeLessThanOrEqual(
        floor.size.d / 2 + 0.01,
      )
    }
  })

  it('uses the boss template overrides and dressing', () => {
    const boss = placements.filter((p) => p.floorKey === 'boss')
    expect(boss.some((p) => p.model === 'desk_boss_01')).toBe(true)
    expect(boss.some((p) => p.model === 'set_boss_lounge_01')).toBe(true)
    expect(boss.some((p) => p.model === 'chair_visitor_01')).toBe(false)
  })

  it('a new department floor gets furniture with no map change', () => {
    const config = makeSeedConfig()
    const first = config.departments[0]
    if (!first) throw new Error('seed has no department')
    const bigger = computeBuildingLayout({
      ...config,
      departments: [
        ...config.departments,
        { ...first, id: 'dep_new' as typeof first.id, key: 'newdept', order: 99 },
      ],
    })
    const next = buildFurniturePlacements(bigger, FURNITURE_MAP, manifest)
    expect(next.some((p) => p.floorKey === 'newdept' && p.model === 'table_meeting_01')).toBe(true)
  })

  it('skips models missing from the manifest instead of throwing', () => {
    const broken: FurnitureMap = {
      ...FURNITURE_MAP,
      slots: {
        ...FURNITURE_MAP.slots,
        idle_water: { models: [{ model: 'does_not_exist' }], fallback: true },
      },
    }
    const out = buildFurniturePlacements(layout, broken, manifest)
    expect(out.some((p) => p.model === 'does_not_exist')).toBe(false)
  })

  it('slotsWithModels lists only slots whose main model is ready', () => {
    const none = slotsWithModels(placements, () => false)
    expect(none.size).toBe(0)
    const onlyWater = slotsWithModels(placements, (m) => m === 'water_dispenser_01')
    expect([...onlyWater].every((k) => k.endsWith('/idle_water'))).toBe(true)
    expect(onlyWater.size).toBeGreaterThan(0)
  })
})

describe('buildShellPlacements (P06b R3)', () => {
  const shell = buildShellPlacements(layout, FURNITURE_MAP.kit, manifest)
  const count = (floorKey: string, model: string) =>
    shell.filter((p) => p.floorKey === floorKey && p.model === model).length

  it('tiles a 24 m back wall with six 4 m window modules', () => {
    expect(count('cs', 'wall_window_01')).toBeGreaterThanOrEqual(6)
    const back = shell.filter(
      (p) => p.floorKey === 'cs' && p.model === 'wall_window_01' && p.position[2] < -6.9,
    )
    expect(back).toHaveLength(6)
    back.forEach((p) => expect(p.scale[0]).toBeCloseTo(1))
  })

  it('stretches side modules to fit 14 m exactly', () => {
    const west = shell.filter(
      (p) => p.floorKey === 'cs' && p.position[0] < -11.9 && p.model.startsWith('wall_'),
    )
    expect(west).toHaveLength(4)
    west.forEach((p) => expect(p.scale[0]).toBeCloseTo(14 / 16))
  })

  it('puts a glass door in every interior wall that has one', () => {
    expect(count('cs', 'office_glass_door_01')).toBe(1)
    expect(count('management', 'office_glass_door_01')).toBe(1)
    expect(count('lobby_cafe', 'office_glass_door_01')).toBe(0)
  })

  it('rails the boss terrace and leaves the cars to the people layer', () => {
    expect(count('boss', 'terrace_rail_01')).toBeGreaterThan(0)
    expect(count('cs', 'terrace_rail_01')).toBe(0)
    expect(count('lobby_cafe', 'elevator_car_01')).toBe(0)
    expect(count('cs', 'elevator_car_01')).toBe(0)
    expect(count('cs', 'elevator_door_frame_01')).toBe(2)
  })

  it('has no stair flight above the top floor', () => {
    expect(count('boss', 'stairs_flight_01')).toBe(0)
    expect(count('cs', 'stairs_flight_01')).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { computeBuildingLayout } from '@/scene/layout/buildingLayout'
import { chairPoint, stationFor } from '@/scene/director/stations'
import manifestJson from '../../../../../public/assets/manifest.json'
import { pileAnchors, pileOwnerIds } from '../../pileModel'
import {
  anchorToFloor,
  enrichBuildingLayout,
  enrichFloorLayout,
  isSeatFurniture,
  placementObstacleRect,
  toFloorRotY,
  toFloorX,
  toFloorZ,
} from '../floorArt'
import { FURNITURE_MAP } from '../furnitureMap'
import { AssetManifestSchema } from '../manifest'
import { slotRotationToWorld, type Placement } from '../placements'
import { toWorldX, toWorldZ } from '../../coords'

const manifest = AssetManifestSchema.parse(manifestJson)
const layout = computeBuildingLayout(makeSeedConfig())

describe('floorArt: inverse coordinate transform (P06b-T08)', () => {
  const w = 24
  const d = 14

  it('toFloorX and toFloorZ invert toWorldX and toWorldZ exactly', () => {
    const testPoints = [
      { x: 0, z: 0 },
      { x: 12, z: 7 },
      { x: 24, z: 14 },
      { x: 4.5, z: 8.2 },
      { x: 20.5, z: 11 },
    ]
    for (const { x, z } of testPoints) {
      const wx = toWorldX(x, w)
      const wz = toWorldZ(z, d)
      expect(toFloorX(wx, w)).toBeCloseTo(x, 9)
      expect(toFloorZ(wz, d)).toBeCloseTo(z, 9)
    }
  })

  it('toFloorRotY inverts slotRotationToWorld', () => {
    const angles = [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2]
    for (const a of angles) {
      const worldRot = slotRotationToWorld(a)
      const floorRot = toFloorRotY(worldRot)
      // Normalise a to [-PI, PI] for comparison
      const normA = Math.atan2(Math.sin(a), Math.cos(a))
      expect(floorRot).toBeCloseTo(normA, 9)
    }
  })

  it('hand example: desk placed at (x=8.2, z=4.2) rotated PI/2', () => {
    // Slot in floor space:
    const slotX = 8.2
    const slotZ = 4.2
    const slotRotY = Math.PI / 2

    // Placed in world space by placements.ts:
    const wx = toWorldX(slotX, w) // 8.2 - 12 = -3.8
    const wz = toWorldZ(slotZ, d) // 7 - 4.2 = 2.8
    const wRotY = slotRotationToWorld(slotRotY) // PI - PI/2 = PI/2

    const placement: Placement = {
      model: 'desk_standard_01',
      floorKey: 'cs',
      floorIndex: 1,
      slotId: 'desk_1',
      primary: true,
      position: [wx, 3.8, wz],
      rotY: wRotY,
      scale: [1, 1, 1],
    }

    // Model seat anchor in model space: [0, 0.46, -0.6], rotY=0
    const anchor = {
      kind: 'seat',
      pos: [0, 0.46, -0.6] as [number, number, number],
      rotY: 0,
    }

    const floorSeat = anchorToFloor(placement, anchor, { w, d }, 3.8)

    // Hand calculation:
    // In model space, anchor is at (0, -0.6).
    // Rotated by world rotY = PI/2:
    // dx = 0 * cos(PI/2) + (-0.6) * sin(PI/2) = -0.6
    // dz = -0 * sin(PI/2) + (-0.6) * cos(PI/2) = 0
    // World pos: wx + dx = -3.8 - 0.6 = -4.4; wz + dz = 2.8 + 0 = 2.8
    // Floor pos:
    // fx = -4.4 + 12 = 7.6
    // fz = 7 - 2.8 = 4.2
    // fy = 0.46
    // fRotY = toFloorRotY(PI/2 + 0) = PI/2
    expect(floorSeat.x).toBeCloseTo(7.6, 6)
    expect(floorSeat.z).toBeCloseTo(4.2, 6)
    expect(floorSeat.y).toBeCloseTo(0.46, 6)
    expect(floorSeat.rotY).toBeCloseTo(Math.PI / 2, 6)
  })

  it('hand example: placementObstacleRect for standard desk', () => {
    const entry = manifest.files['desk_standard_01']
    expect(entry).toBeDefined()
    if (!entry) return

    const placement: Placement = {
      model: 'desk_standard_01',
      floorKey: 'cs',
      floorIndex: 1,
      slotId: 'desk_1',
      primary: true,
      position: [toWorldX(8.2, w), 0, toWorldZ(4.2, d)],
      rotY: slotRotationToWorld(0),
      scale: [1, 1, 1],
    }

    const obs = placementObstacleRect(placement, entry, { w, d }, 0)
    expect(obs).not.toBeNull()
    if (!obs) return

    expect(obs.cx).toBeCloseTo(8.2, 6)
    expect(obs.cz).toBeCloseTo(4.2, 6)
    expect(obs.halfX).toBeCloseTo(0.7, 6)
    expect(obs.halfZ).toBeCloseTo(0.35, 6)
    expect(obs.cos).toBeCloseTo(1, 6)
    expect(obs.sin).toBeCloseTo(0, 6)
    expect(obs.slotId).toBe('desk_1')
  })
})

describe('placementObstacleRect exclusions', () => {
  const floorSize = { w: 24, d: 14 }
  const makePlacement = (model: string, y = 0, slotId: string | null = 'test_slot'): Placement => ({
    model,
    floorKey: 'cs',
    floorIndex: 0,
    slotId,
    primary: true,
    position: [0, y, 0],
    rotY: Math.PI,
    scale: [1, 1, 1],
  })

  it('excludes seat furniture people sit on', () => {
    const seatModels = [
      'chair_office_01',
      'chair_office_02',
      'chair_visitor_01',
      'stool_cafe_01',
      'bench_waiting_01',
      'sofa_2seat_01',
      'sofa_3seat_01',
      'armchair_01',
      'bed_single_01',
      'sleep_pod_01',
      'chair_massage_01',
      'set_karaoke_01',
      'set_boss_lounge_01',
    ]
    for (const m of seatModels) {
      expect(isSeatFurniture(m), `${m} is seat furniture`).toBe(true)
      const entry = manifest.files[m]
      if (entry) {
        expect(placementObstacleRect(makePlacement(m), entry, floorSize, 0), m).toBeNull()
      }
    }
  })

  it('excludes wall-mounted and ceiling items', () => {
    // Clocks and paintings at y >= 1.8
    const clock = manifest.files['clock_wall_01']
    if (clock) {
      expect(placementObstacleRect(makePlacement('clock_wall_01', 2.5), clock, floorSize, 0)).toBeNull()
    }
    const painting = manifest.files['painting_01']
    if (painting) {
      expect(placementObstacleRect(makePlacement('painting_01', 1.9), painting, floorSize, 0)).toBeNull()
    }
    const fan = manifest.files['fan_ceiling_01']
    if (fan) {
      expect(placementObstacleRect(makePlacement('fan_ceiling_01', 3.68), fan, floorSize, 0)).toBeNull()
    }
    const hanging = manifest.files['plant_hanging_01']
    if (hanging) {
      expect(placementObstacleRect(makePlacement('plant_hanging_01', 3.68), hanging, floorSize, 0)).toBeNull()
    }
  })

  it('excludes flat things like rugs', () => {
    const rug = manifest.files['rug_large_01']
    if (rug) {
      expect(placementObstacleRect(makePlacement('rug_large_01', 0), rug, floorSize, 0)).toBeNull()
    }
  })

  it('retains solid furniture obstacles', () => {
    const solidModels = [
      'desk_standard_01',
      'desk_boss_01',
      'table_meeting_01',
      'table_pingpong_01',
      'bookshelf_tall_01',
      'cabinet_file_01',
      'printer_01',
      'coffee_machine_01',
      'aquarium_01',
    ]
    for (const m of solidModels) {
      const entry = manifest.files[m]
      expect(entry, `${m} exists in manifest`).toBeDefined()
      if (entry) {
        const obs = placementObstacleRect(makePlacement(m), entry, floorSize, 0)
        expect(obs, `${m} produces an obstacle`).not.toBeNull()
      }
    }
  })
})

describe('enrichBuildingLayout with real manifest and templates', () => {
  const enriched = enrichBuildingLayout(layout, FURNITURE_MAP, manifest)

  it('adds art data to every floor', () => {
    for (const floor of enriched.floors) {
      expect(floor.art, `${floor.key} has art data`).toBeDefined()
      expect(Object.keys(floor.art!.seats).length).toBeGreaterThan(0)
      expect(floor.art!.obstacles.length).toBeGreaterThan(0)
      expect(floor.art!.slotsWithModels.length).toBeGreaterThan(0)
    }
  })

  it('desks have seats and pile anchors matching the model', () => {
    const cs = enriched.floors.find((f) => f.key === 'cs')!
    const desks = cs.slots.filter((s) => s.type === 'desk')
    expect(desks.length).toBeGreaterThan(0)
    for (const desk of desks) {
      const seats = cs.art!.seats[desk.id]
      expect(seats, `${desk.id} has seats`).toBeDefined()
      expect(seats).toHaveLength(1)
      const seat = seats![0]!

      // Seat should be close to chairPoint
      const cp = chairPoint(desk)
      const dist = Math.hypot(seat.x - cp.x, seat.z - cp.z)
      expect(dist).toBeLessThan(0.15)

      // Pile anchor should exist
      const pile = cs.art!.piles[desk.id]
      expect(pile, `${desk.id} has pile`).toBeDefined()
    }
  })

  it('meeting table has 6 seats', () => {
    const cs = enriched.floors.find((f) => f.key === 'cs')!
    const seats = cs.art!.seats['meeting_table']
    expect(seats).toBeDefined()
    expect(seats).toHaveLength(6)
  })

  it('stationFor reads art data when present and falls back cleanly', () => {
    const cs = enriched.floors.find((f) => f.key === 'cs')!
    const desk = cs.slots.find((s) => s.type === 'desk')!

    // With art data:
    const station = stationFor(cs, desk)
    const artSeat = cs.art!.seats[desk.id]![0]!
    expect(station.seat.x).toBeCloseTo(artSeat.x, 6)
    expect(station.seat.z).toBeCloseTo(artSeat.z, 6)
    expect(station.heading).toBeCloseTo(artSeat.rotY, 6)

    // Fallback without art data:
    const rawCs = layout.floors.find((f) => f.key === 'cs')!
    const fallbackStation = stationFor(rawCs, desk)
    const cp = chairPoint(desk)
    expect(fallbackStation.seat.x).toBeCloseTo(cp.x, 6)
    expect(fallbackStation.seat.z).toBeCloseTo(cp.z, 6)

    // Single-floor enrichment matches building enrichment
    const single = enrichFloorLayout(rawCs, FURNITURE_MAP, manifest)
    expect(single.art).toEqual(cs.art)
  })

  it('pileAnchors reads art data when present and falls back cleanly', () => {
    const ownerIds = pileOwnerIds(makeSeedConfig())
    expect(ownerIds.length).toBeGreaterThan(0)

    // With art data: reads floor.art.piles
    const artAnchors = pileAnchors(enriched, ownerIds)
    expect(artAnchors.length).toBeGreaterThan(0)
    for (const anchor of artAnchors) {
      const floor = enriched.floors[anchor.floorIndex]!
      const seat = enriched.seatOf[anchor.employeeId]!
      const expected = floor.art!.piles[seat.slotId]!
      expect(anchor.x).toBeCloseTo(expected.x, 6)
      expect(anchor.z).toBeCloseTo(expected.z, 6)
      expect(anchor.rotY).toBeCloseTo(expected.rotY, 6)
    }

    // Without art data: falls back to .pile slot
    const rawAnchors = pileAnchors(layout, ownerIds)
    expect(rawAnchors).toHaveLength(artAnchors.length)
    for (const anchor of rawAnchors) {
      const floor = layout.floors[anchor.floorIndex]!
      const seat = layout.seatOf[anchor.employeeId]!
      const slot = floor.slots.find((s) => s.id === `${seat.slotId}.pile`)!
      expect(anchor.x).toBeCloseTo(slot.x, 6)
      expect(anchor.z).toBeCloseTo(slot.z, 6)
    }
  })
})

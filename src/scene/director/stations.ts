import type { Slot, SlotType } from '@/domain/config'
import type { EmployeeId } from '@/domain/primitives'
import type { BuildingLayout, FloorLayout } from '@/scene/layout'
import type { Vec2 } from '@/scene/nav/types'
import type { PoseKey } from './poses'
import { TUNING } from './tuning'
import type { Station } from './types'

const CELL = 0.5

export function cellCentre(cell: readonly [number, number]): Vec2 {
  return { x: (cell[0] + 0.5) * CELL, z: (cell[1] + 0.5) * CELL }
}

export function headingTo(from: Vec2, to: Vec2, fallback = 0): number {
  const dx = to.x - from.x
  const dz = to.z - from.z
  if (dx * dx + dz * dz < 1e-6) return fallback
  return Math.atan2(dx, dz)
}

export function approachOf(slot: Slot): Vec2 {
  return slot.approach ? cellCentre(slot.approach) : { x: slot.x, z: slot.z }
}

const DESK_TYPES: ReadonlySet<SlotType> = new Set([
  'desk',
  'review_desk',
  'private_office',
  'manager_office',
  'boss_desk',
])

/** Slots a body sits or lies ON (the seat is the slot itself). */
const SEAT_POSE: Partial<Record<SlotType, PoseKey>> = {
  waiting_seat: 'wait_seat',
  idle_sofa: 'sofa',
  idle_massage_chair: 'sofa',
  idle_bed: 'sleep_bed',
}

/** Slots a person stands AT (on the approach cell, facing the thing). */
const STAND_POSE: Partial<Record<SlotType, PoseKey>> = {
  idle_coffee: 'coffee',
  idle_water: 'stand',
  idle_window: 'stand',
  idle_chat: 'talk',
  idle_pingpong: 'play_pingpong',
  idle_arcade: 'play_arcade',
  idle_karaoke: 'karaoke',
  entrance: 'stand',
  stairs_entry: 'stand',
  elevator_door: 'stand',
}

/** Tables with several places around them. */
const TABLE_POSE: Partial<Record<SlotType, PoseKey>> = {
  idle_tea_table: 'tea',
  idle_boardgame: 'play_boardgame',
  meeting_table: 'sit',
}

/** A spot one person stands at (no seat, no table places). */
export function isStandSlot(slot: Slot): boolean {
  return !DESK_TYPES.has(slot.type) && !SEAT_POSE[slot.type] && !TABLE_POSE[slot.type]
}

export function isDeskSlot(slot: Slot): boolean {
  return DESK_TYPES.has(slot.type)
}

/**
 * Where the chair of a workspace stands. Same transform as the blockout
 * renderer: the chair is at local (0, -offset), rotated by `rotY`.
 */
export function chairPoint(slot: Slot): Vec2 {
  const offset = TUNING.chairOffset[slot.type] ?? 0.55
  return {
    x: slot.x - offset * Math.sin(slot.rotY),
    z: slot.z - offset * Math.cos(slot.rotY),
  }
}

/**
 * How a person uses a slot. `seatIndex` picks a place around a shared table
 * (meeting table, tea table).
 */
export function stationFor(floor: FloorLayout, slot: Slot, seatIndex = 0): Station {
  const approach = approachOf(slot)
  const centre: Vec2 = { x: slot.x, z: slot.z }
  const base = {
    floorIndex: floor.index,
    floorKey: floor.key,
    slot,
    approach,
  }

  if (DESK_TYPES.has(slot.type)) {
    // The occupant walks to the chair itself: for review desks and offices
    // the slot's approach cell is the visitor side, across the desk.
    const seat = chairPoint(slot)
    return {
      ...base,
      approach: seat,
      seat,
      heading: headingTo(seat, centre),
      pose: 'sit_work',
      isDesk: true,
    }
  }

  const seatPose = SEAT_POSE[slot.type]
  if (seatPose) {
    return {
      ...base,
      seat: centre,
      heading: slot.type === 'idle_bed' ? slot.rotY : headingTo(centre, approach),
      pose: seatPose,
      isDesk: false,
    }
  }

  const tablePose = TABLE_POSE[slot.type]
  if (tablePose) {
    const places = Math.max(1, slot.capacity ?? 4)
    const angle = slot.rotY + (Math.PI * 2 * (seatIndex % places)) / places + Math.PI / places
    const radius = slot.type === 'meeting_table' ? 1.05 : 0.8
    const seat = {
      x: slot.x + Math.sin(angle) * radius,
      z: slot.z + Math.cos(angle) * radius,
    }
    return {
      ...base,
      seat,
      heading: headingTo(seat, centre),
      pose: tablePose,
      isDesk: false,
    }
  }

  return {
    ...base,
    seat: approach,
    heading: headingTo(approach, centre),
    pose: STAND_POSE[slot.type] ?? 'stand',
    isDesk: false,
  }
}

/** The person's own allocated workspace, or null when the building has no seat for them. */
export function deskStationOf(layout: BuildingLayout, id: EmployeeId): Station | null {
  const seat = layout.seatOf[id]
  if (!seat) return null
  const floorIndex = layout.byKey[seat.floorKey]
  if (floorIndex === undefined) return null
  const floor = layout.floors[floorIndex]
  const slot = floor?.slots.find((s) => s.id === seat.slotId)
  if (!floor || !slot) return null
  return stationFor(floor, slot)
}

export function findSlot(floor: FloorLayout, slotId: string): Slot | null {
  return floor.slots.find((s) => s.id === slotId) ?? null
}

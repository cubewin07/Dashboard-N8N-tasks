import type { BuildingLayout, FloorLayout } from '@/scene/layout'
import type { Vec2 } from './types'

const CELL = 0.5

export type VerticalMode = 'elevator' | 'stairs'

export type RouteSegment =
  | { k: 'walk'; floor: number; to: Vec2 }
  | { k: 'vertical'; mode: VerticalMode; from: number; to: number }

function cellCentre(cell: readonly [number, number]): Vec2 {
  return { x: (cell[0] + 0.5) * CELL, z: (cell[1] + 0.5) * CELL }
}

/** Free cell in front of elevator door `car` (people step out of the car onto it). */
export function elevatorDoorPoint(floor: FloorLayout, car: number): Vec2 {
  const doors = floor.elevatorDoorSlots
  const door = doors[Math.min(car, doors.length - 1)] ?? doors[0]
  if (!door) return stairsPoint(floor)
  return door.approach ? cellCentre(door.approach) : { x: door.x, z: door.z }
}

/** Centre of door `car` on the shaft line. */
export function elevatorDoorCentre(floor: FloorLayout, car: number): Vec2 {
  const doors = floor.elevatorDoorSlots
  const door = doors[Math.min(car, doors.length - 1)] ?? doors[0]
  return door ? { x: door.x, z: door.z } : stairsPoint(floor)
}

/**
 * Where someone waits before a car is assigned: between the doors, `inset`
 * metres into the floor, on a cell centre.
 */
export function elevatorLobbyPoint(floor: FloorLayout, inset: number): Vec2 {
  const doors = floor.elevatorDoorSlots
  if (doors.length === 0) return stairsPoint(floor)
  let x = 0
  let z = 0
  for (let i = 0; i < doors.length; i += 1) {
    const p = elevatorDoorPoint(floor, i)
    x += p.x
    z += p.z
  }
  x = x / doors.length - inset
  z /= doors.length
  return {
    x: (Math.floor(x / CELL) + 0.5) * CELL,
    z: (Math.floor(z / CELL) + 0.5) * CELL,
  }
}

export function stairsPoint(floor: FloorLayout): Vec2 {
  const slot = floor.stairsEntrySlot
  return slot.approach ? cellCentre(slot.approach) : { x: slot.x, z: slot.z }
}

export interface RouteEnd {
  floor: number
  point: Vec2
}

export interface RouteOptions {
  /** How far into the floor callers wait for the elevator (m). */
  lobbyInset?: number
}

/**
 * Building route: `walk(floor A → core)`, `vertical(mode, A → B)`,
 * `walk(core → target)`. A same-floor route is a single walk. The mode is
 * given by the caller (the intent kind decides it, never the distance).
 *
 * After an elevator ride the walk starts from whichever door the car used;
 * the director knows that only at run time, so walk segments carry their
 * destination and are path-found when they start.
 */
export function route(
  layout: BuildingLayout,
  from: RouteEnd,
  to: RouteEnd,
  mode: VerticalMode,
  options: RouteOptions = {},
): RouteSegment[] {
  if (from.floor === to.floor) {
    return [{ k: 'walk', floor: to.floor, to: to.point }]
  }
  const fromFloor = layout.floors[from.floor]
  const toFloor = layout.floors[to.floor]
  if (!fromFloor || !toFloor) {
    return [{ k: 'walk', floor: to.floor, to: to.point }]
  }
  const useElevator = mode === 'elevator' && fromFloor.elevatorDoorSlots.length > 0
  const corePoint = useElevator
    ? elevatorLobbyPoint(fromFloor, options.lobbyInset ?? 0.9)
    : stairsPoint(fromFloor)
  return [
    { k: 'walk', floor: from.floor, to: corePoint },
    { k: 'vertical', mode: useElevator ? 'elevator' : 'stairs', from: from.floor, to: to.floor },
    { k: 'walk', floor: to.floor, to: to.point },
  ]
}

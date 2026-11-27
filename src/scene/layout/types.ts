import type { FloorTemplate, Slot, WallSegment } from '@/domain/config'
import type { DepartmentId, EmployeeId, Label } from '@/domain/primitives'
import type { ObstacleRect } from './obstacles'

export type FloorKind = 'lobby_cafe' | 'department' | 'games_rest' | 'management' | 'boss'

export interface FloorSeatArt {
  x: number
  z: number
  y?: number
  rotY: number
}

export interface FloorPileArt {
  x: number
  z: number
  y?: number
  rotY: number
}

export interface FloorArtData {
  /** Per-slot seat positions in floor-local coordinates. */
  seats: Record<string, FloorSeatArt[]>
  /** Per-slot pile anchor positions in floor-local coordinates. */
  piles: Record<string, FloorPileArt>
  /** Nav obstacles in floor-local coordinates from placed model footprints/bboxes. */
  obstacles: ObstacleRect[]
  /** Slot ids of all slots that have models placed. */
  slotsWithModels: string[]
}

export interface FloorLayout {
  index: number
  key: string
  kind: FloorKind
  departmentId: DepartmentId | null
  annexIndex: number
  label: Label
  colorSwatch: string
  y: number
  size: { w: number; d: number; h: number }
  templateKey: string
  slots: Slot[]
  walls: WallSegment[]
  elevatorDoorSlots: Slot[]
  stairsEntrySlot: Slot
  occupants: Record<string, EmployeeId>
  art?: FloorArtData
}

export interface SeatAssignment {
  employeeId: EmployeeId
  floorKey: string
  slotId: string
}

export interface BuildingLayout {
  floors: FloorLayout[]
  floorHeight: number
  totalHeight: number
  footprint: { w: number; d: number }
  bounds: { min: [number, number, number]; max: [number, number, number] }
  shafts: {
    elevator: { x: number; z: number; cars: number }
    stairs: { x: number; z: number }
  }
  byKey: Record<string, number>
  seatOf: Record<EmployeeId, SeatAssignment>
  seatAssignments: Record<EmployeeId, SeatAssignment>
  elevatorCarCount: number
}

export type FloorTemplateMap = ReadonlyMap<string, FloorTemplate>

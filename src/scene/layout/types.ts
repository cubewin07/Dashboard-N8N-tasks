import type { FloorTemplate, Slot, WallSegment } from '@/domain/config'
import type { DepartmentId, EmployeeId, Label } from '@/domain/primitives'

export type FloorKind = 'lobby_cafe' | 'department' | 'games_rest' | 'management' | 'boss'

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
}

export interface SeatAssignment {
  employeeId: EmployeeId
  floorKey: string
  slotId: string
}

export interface BuildingLayout {
  floors: FloorLayout[]
  totalHeight: number
  bounds: { min: [number, number, number]; max: [number, number, number] }
  seatAssignments: Record<EmployeeId, SeatAssignment>
  elevatorCarCount: number
}

export type FloorTemplateMap = ReadonlyMap<string, FloorTemplate>

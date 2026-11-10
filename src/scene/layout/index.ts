export { allocateSeats } from './allocate'
export { computeBuildingLayout } from './buildingLayout'
export {
  buildFloorSlots,
  generateDeskClusterSlots,
  generatePileAnchorSlots,
} from './floorLayout'
export { buildTemplateMap, getFloorTemplate } from './templates'
export type {
  BuildingLayout,
  FloorKind,
  FloorLayout,
  FloorTemplateMap,
  SeatAssignment,
} from './types'

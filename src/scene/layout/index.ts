export { allocateSeats } from './allocate'
export { buildBuildingLayout, computeBuildingLayout } from './buildingLayout'
export {
  buildFloorSlots,
  generateDeskClusterSlots,
  generatePileAnchorSlots,
} from './floorLayout'
export {
  SLOT_OBSTACLE,
  obstacleBounds,
  obstacleContains,
  slotBlocksFloor,
  slotObstacleRect,
} from './obstacles'
export type { ObstacleRect, ObstacleSpec } from './obstacles'
export { buildTemplateMap, getFloorTemplate } from './templates'
export type {
  BuildingLayout,
  FloorArtData,
  FloorKind,
  FloorLayout,
  FloorPileArt,
  FloorSeatArt,
  FloorTemplateMap,
  SeatAssignment,
} from './types'

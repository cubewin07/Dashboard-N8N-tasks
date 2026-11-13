import type { BuildingLayout, FloorArtData, FloorLayout, FloorPileArt, FloorSeatArt, ObstacleRect } from '@/scene/layout'
import type { FurnitureMap } from './furnitureMap'
import type { AssetManifest, ManifestAnchor, ManifestEntry } from './manifest'
import {
  buildFloorFurniturePlacements,
  buildFurniturePlacements,
  rotateY,
  type Placement,
} from './placements'

/**
 * Converts building-centred world X into floor-local X metres:
 * `worldX = x - w / 2`  =>  `x = worldX + w / 2`
 */
export function toFloorX(worldX: number, w = 24): number {
  return worldX + w / 2
}

/**
 * Converts building-centred world Z into floor-local Z metres:
 * `worldZ = d / 2 - z`  =>  `z = d / 2 - worldZ`
 */
export function toFloorZ(worldZ: number, d = 14): number {
  return d / 2 - worldZ
}

/**
 * Converts world three.js rotY to floor-local rotY:
 * `worldRotY = Math.PI - floorRotY`  =>  `floorRotY = Math.PI - worldRotY`
 * Normalised to [-Math.PI, Math.PI].
 */
export function toFloorRotY(worldRotY: number): number {
  const r = Math.PI - worldRotY
  return Math.atan2(Math.sin(r), Math.cos(r))
}

/**
 * Transforms an anchor on a placed model into floor-local coordinates.
 */
export function anchorToFloor(
  placement: Pick<Placement, 'position' | 'rotY'>,
  anchor: ManifestAnchor,
  floorSize: { w: number; d: number },
  floorY: number,
): FloorSeatArt & FloorPileArt {
  const [dx, dz] = rotateY(placement.rotY, anchor.pos[0], anchor.pos[2])
  const wx = placement.position[0] + dx
  const wy = placement.position[1] + anchor.pos[1]
  const wz = placement.position[2] + dz
  const wRot = placement.rotY + anchor.rotY
  return {
    x: toFloorX(wx, floorSize.w),
    z: toFloorZ(wz, floorSize.d),
    y: wy - floorY,
    rotY: toFloorRotY(wRot),
  }
}

/** True when the model is seat furniture people sit on/in (chairs, stools, benches, sofas, beds). */
export function isSeatFurniture(model: string): boolean {
  return /^(chair_|stool_|bench_|sofa_|bed_|sleep_pod_|armchair_|terrace_chair_|set_karaoke_|set_boss_lounge_)/.test(
    model,
  )
}

/**
 * Converts a model placement into an oriented obstacle rectangle on the floor,
 * or `null` if the item is excluded (seats, wall-mounted, flat, or ceiling).
 */
export function placementObstacleRect(
  placement: Placement,
  entry: ManifestEntry,
  floorSize: { w: number; d: number },
  floorY: number,
): ObstacleRect | null {
  // 1. Seat furniture people sit in (chairs, stools, benches, sofas, beds, lounge/karaoke seating sets)
  if (isSeatFurniture(placement.model)) {
    return null
  }

  const localY = placement.position[1] - floorY
  const localMinY = localY + entry.bbox.min[1]
  const height = entry.bbox.max[1] - entry.bbox.min[1]

  // 2. Wall-mounted things (placement y >= 1.8 or bbox min y >= 1.8, e.g. clocks, paintings, tv)
  if (localY >= 1.8 || localMinY >= 1.8) {
    return null
  }

  // 3. Flat things (height < 0.15, rugs)
  if (height < 0.15 || placement.model.includes('rug')) {
    return null
  }

  // 4. Anything hanging from the ceiling (fans, lights, hanging plants)
  if (
    placement.model.includes('fan') ||
    placement.model.includes('ceiling') ||
    placement.model.includes('hanging') ||
    localMinY >= 2.4
  ) {
    return null
  }

  // Accessories resting on desk/table tops
  if (!placement.primary && placement.slotId !== null && localY >= 0.5) {
    return null
  }

  let minX = entry.bbox.min[0]
  let maxX = entry.bbox.max[0]
  let minZ = entry.bbox.min[2]
  let maxZ = entry.bbox.max[2]

  // Desks with L-returns (desk_manager_01): the obstacle is the desk surface itself,
  // leaving the kneehole and manager chair area behind it open and reachable.
  const hasPile = entry.anchors.some((a) => a.kind === 'pile')
  if (hasPile || placement.model.startsWith('desk_')) {
    if (minZ < -maxZ) {
      minZ = -maxZ
    }
  }

  // Tea table set (set_tea_table_01): obstacle is the central table, leaving the surrounding
  // cushion seats open and reachable.
  if (placement.model === 'set_tea_table_01') {
    minX = -0.5
    maxX = 0.5
    minZ = -0.5
    maxZ = 0.5
  }

  let halfX = (maxX - minX) / 2
  let halfZ = (maxZ - minZ) / 2
  const localCx = (minX + maxX) / 2
  const localCz = (minZ + maxZ) / 2

  // Floor plants: pot size is <= 0.3 m (foliage flares out above head/knee height)
  if (placement.model.startsWith('plant_') && !placement.model.includes('desk')) {
    halfX = Math.min(halfX, 0.3)
    halfZ = Math.min(halfZ, 0.3)
  }

  const [dx, dz] = rotateY(placement.rotY, localCx, localCz)
  const wx = placement.position[0] + dx
  const wz = placement.position[2] + dz
  const cx = toFloorX(wx, floorSize.w)
  const cz = toFloorZ(wz, floorSize.d)
  const rotY = toFloorRotY(placement.rotY)

  return {
    cx,
    cz,
    halfX,
    halfZ,
    cos: Math.cos(rotY),
    sin: Math.sin(rotY),
    slotId: placement.slotId,
  }
}

/**
 * Builds art data (seats, piles, nav obstacles) for one floor from placements and manifest.
 */
export function buildFloorArtData(
  floor: FloorLayout,
  placements: readonly Placement[],
  manifest: AssetManifest,
): FloorArtData {
  const seats: Record<string, FloorSeatArt[]> = {}
  const piles: Record<string, FloorPileArt> = {}
  const obstacles: ObstacleRect[] = []
  const slotsWithModels: string[] = []

  // Group placements by slotId
  const bySlot = new Map<string, Placement[]>()
  for (const p of placements) {
    if (p.slotId) {
      const list = bySlot.get(p.slotId) ?? []
      list.push(p)
      bySlot.set(p.slotId, list)
    }
  }

  // Primary model slots
  for (const p of placements) {
    if (p.primary && p.slotId && manifest.files[p.model]) {
      slotsWithModels.push(p.slotId)
    }
  }

  // 1. Seats and piles per slot
  for (const [slotId, slotPlacementsList] of bySlot) {
    const primary = slotPlacementsList.find((p) => p.primary)
    const primaryEntry = primary ? manifest.files[primary.model] : undefined

    // Check primary model's seat anchors first
    const primarySeats = primaryEntry?.anchors.filter((a) => a.kind === 'seat') ?? []
    if (primary && primarySeats.length > 0) {
      seats[slotId] = primarySeats.map((a) =>
        anchorToFloor(primary, a, floor.size, floor.y),
      )
    } else {
      // If primary has no seat anchors, check companion placements (e.g. cafe counter stools)
      const companionSeats: FloorSeatArt[] = []
      for (const comp of slotPlacementsList) {
        if (comp.primary) continue
        const compEntry = manifest.files[comp.model]
        const anchors = compEntry?.anchors.filter((a) => a.kind === 'seat') ?? []
        for (const a of anchors) {
          companionSeats.push(anchorToFloor(comp, a, floor.size, floor.y))
        }
      }
      if (companionSeats.length > 0) {
        seats[slotId] = companionSeats
      }
    }

    // Pile anchor from primary model
    const pileAnchor = primaryEntry?.anchors.find((a) => a.kind === 'pile')
    if (primary && pileAnchor) {
      piles[slotId] = anchorToFloor(primary, pileAnchor, floor.size, floor.y)
    }
  }

  // 2. Obstacles from all placements on this floor
  for (const p of placements) {
    const entry = manifest.files[p.model]
    if (!entry) continue
    const obs = placementObstacleRect(p, entry, floor.size, floor.y)
    if (obs) {
      obstacles.push(obs)
    }
  }

  return {
    seats,
    piles,
    obstacles,
    slotsWithModels,
  }
}

/**
 * Enriches one FloorLayout with art data derived from furniture placements and manifest.
 */
export function enrichFloorLayout(
  floor: FloorLayout,
  map: FurnitureMap,
  manifest: AssetManifest,
  placements?: readonly Placement[],
): FloorLayout {
  const floorPlacements = placements ?? buildFloorFurniturePlacements(floor, map, manifest)
  const art = buildFloorArtData(floor, floorPlacements, manifest)
  return {
    ...floor,
    art,
  }
}

/**
 * Enriches an entire BuildingLayout with art data for every floor.
 */
export function enrichBuildingLayout(
  layout: BuildingLayout,
  map: FurnitureMap,
  manifest: AssetManifest,
  placements?: readonly Placement[],
): BuildingLayout {
  const allPlacements = placements ?? buildFurniturePlacements(layout, map, manifest)
  const byFloorKey = new Map<string, Placement[]>()
  for (const p of allPlacements) {
    const list = byFloorKey.get(p.floorKey) ?? []
    list.push(p)
    byFloorKey.set(p.floorKey, list)
  }

  const floors = layout.floors.map((floor) => {
    const floorPlacements = byFloorKey.get(floor.key) ?? []
    const art = buildFloorArtData(floor, floorPlacements, manifest)
    return {
      ...floor,
      art,
    }
  })

  return {
    ...layout,
    floors,
  }
}

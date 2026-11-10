import type { WallSegment } from '@/domain/config'
import type { BuildingLayout, FloorLayout } from '@/scene/layout'
import { toWorldX, toWorldZ } from '../coords'
import type { FurnitureKit } from './furnitureMap'
import type { AssetManifest } from './manifest'
import type { Placement } from './placements'

const EPS = 0.01
/** Width of the open terrace on the west side of the boss floor (metres). */
const TERRACE_DEPTH = 6

type WallRole = 'back' | 'side' | 'interior'

function wallRole(wall: WallSegment, w: number, d: number): WallRole {
  const onBack = Math.abs(wall.z1 - d) < EPS && Math.abs(wall.z2 - d) < EPS
  if (onBack) return 'back'
  const onWest = Math.abs(wall.x1) < EPS && Math.abs(wall.x2) < EPS
  const onEast = Math.abs(wall.x1 - w) < EPS && Math.abs(wall.x2 - w) < EPS
  return onWest || onEast ? 'side' : 'interior'
}

function moduleLength(manifest: AssetManifest, model: string): number {
  const entry = manifest.files[model]
  if (!entry) return 0
  return entry.bbox.max[0] - entry.bbox.min[0]
}

interface RunOptions {
  floor: FloorLayout
  manifest: AssetManifest
  models: readonly string[]
  /** Floor-local start point and unit direction of the run. */
  x: number
  z: number
  ux: number
  uz: number
  length: number
  /** Storey height to stretch to, or `null` to keep the model height. */
  fitHeight: number | null
}

/** Tiles one straight run with modules, stretched along the run to fit exactly. */
function tileRun(opts: RunOptions): Placement[] {
  const { floor, manifest, models, length } = opts
  if (length < 0.05 || models.length === 0) return []
  const first = models[0]
  if (!first) return []
  const modLen = moduleLength(manifest, first)
  if (modLen <= 0) return []
  const count = Math.max(1, Math.round(length / modLen))
  const step = length / count
  const { w, d } = floor.size

  // Model +X runs along the wall; its −Z "front" must look into the floor.
  let rotY = Math.atan2(opts.uz, opts.ux)
  const midX = toWorldX(opts.x + (opts.ux * length) / 2, w)
  const midZ = toWorldZ(opts.z + (opts.uz * length) / 2, d)
  const frontX = -Math.sin(rotY)
  const frontZ = -Math.cos(rotY)
  if (frontX * -midX + frontZ * -midZ < 0) rotY += Math.PI

  const out: Placement[] = []
  for (let i = 0; i < count; i += 1) {
    const model = models[i % models.length] ?? first
    const entry = manifest.files[model]
    if (!entry) continue
    const len = entry.bbox.max[0] - entry.bbox.min[0]
    const height = entry.bbox.max[1] - Math.max(0, entry.bbox.min[1])
    const dist = (i + 0.5) * step
    out.push({
      model,
      floorKey: floor.key,
      floorIndex: floor.index,
      slotId: null,
      primary: false,
      position: [
        toWorldX(opts.x + opts.ux * dist, w),
        floor.y,
        toWorldZ(opts.z + opts.uz * dist, d),
      ],
      rotY,
      scale: [step / len, opts.fitHeight ? opts.fitHeight / height : 1, 1],
    })
  }
  return out
}

function wallPlacements(
  floor: FloorLayout,
  wall: WallSegment,
  kit: FurnitureKit,
  manifest: AssetManifest,
  storey: number,
): Placement[] {
  const dx = wall.x2 - wall.x1
  const dz = wall.z2 - wall.z1
  const length = Math.hypot(dx, dz)
  if (length < 0.05) return []
  const ux = dx / length
  const uz = dz / length
  const role = wallRole(wall, floor.size.w, floor.size.d)
  const models =
    role === 'back' ? kit.wallBack : role === 'side' ? kit.wallSide : [kit.wallInterior]
  const fitHeight = role === 'interior' ? null : storey
  const run = (start: number, len: number, runModels: readonly string[]) =>
    tileRun({
      floor,
      manifest,
      models: runModels,
      x: wall.x1 + ux * start,
      z: wall.z1 + uz * start,
      ux,
      uz,
      length: len,
      fitHeight,
    })

  if (!wall.door) return run(0, length, models)
  const doorStart = Math.max(0, Math.min(length, wall.door.offset))
  const doorEnd = Math.max(doorStart, Math.min(length, wall.door.offset + wall.door.width))
  return [
    ...run(0, doorStart, models),
    // Perimeter doors stay an opening; interior ones get the glass door.
    ...(role === 'interior' ? run(doorStart, doorEnd - doorStart, [kit.doorInterior]) : []),
    ...run(doorEnd, length - doorEnd, models),
  ]
}

function terracePlacements(
  floor: FloorLayout,
  kit: FurnitureKit,
  manifest: AssetManifest,
): Placement[] {
  const { d } = floor.size
  const rail = [kit.terraceRail]
  const base = { floor, manifest, models: rail, fitHeight: null }
  return [
    ...tileRun({ ...base, x: 0, z: 0.06, ux: 1, uz: 0, length: TERRACE_DEPTH }),
    ...tileRun({ ...base, x: 0.06, z: 0, ux: 0, uz: 1, length: d }),
    ...tileRun({ ...base, x: 0, z: d - 0.06, ux: 1, uz: 0, length: TERRACE_DEPTH }),
  ]
}

function vertical(
  floor: FloorLayout,
  model: string,
  x: number,
  z: number,
  rotY: number,
  scale: [number, number, number],
  y = 0,
): Placement {
  const { w, d } = floor.size
  return {
    model,
    floorKey: floor.key,
    floorIndex: floor.index,
    slotId: null,
    primary: false,
    position: [toWorldX(x, w), floor.y + y, toWorldZ(z, d)],
    rotY,
    scale,
  }
}

/** Elevator bank: a framed shaft bay and landing door per car on every floor. */
function elevatorPlacements(
  floor: FloorLayout,
  kit: FurnitureKit,
  manifest: AssetManifest,
  carCount: number,
): Placement[] {
  const doors = floor.elevatorDoorSlots
  if (doors.length === 0) return []
  const sorted = [...doors].sort((a, b) => a.z - b.z)
  const pitch =
    sorted.length > 1 ? Math.abs((sorted[1]?.z ?? 0) - (sorted[0]?.z ?? 0)) : 2.4
  const bay = Math.min(2.4, pitch)
  const frameLen = moduleLength(manifest, kit.shaftFrame) || 2.4
  const doorLen = moduleLength(manifest, kit.elevatorDoor) || 2.4
  const carLen = moduleLength(manifest, kit.elevatorCar) || 2
  const k = bay / frameLen
  const out: Placement[] = []
  doors.forEach((door, idx) => {
    // Doors face west (people walk in from the floor); the shaft sits east of them.
    const rotY = Math.PI / 2
    const cx = door.x + 0.1 + (frameLen * k) / 2
    out.push(vertical(floor, kit.shaftFrame, cx, door.z, rotY, [k, 1, k]))
    out.push(vertical(floor, kit.elevatorDoor, door.x, door.z, rotY, [bay / doorLen, 1, 1]))
    if (floor.index === 0 && idx < carCount) {
      const ck = (bay * 0.88) / carLen
      out.push(vertical(floor, kit.elevatorCar, cx, door.z, rotY, [ck, ck, ck]))
    }
  })
  return out
}

/** Dog-leg stair: two half flights and a landing per storey (none on the top floor). */
function stairPlacements(
  floor: FloorLayout,
  kit: FurnitureKit,
  manifest: AssetManifest,
  storey: number,
  isTop: boolean,
): Placement[] {
  if (isTop) return []
  const flight = manifest.files[kit.stairsFlight]
  const landing = manifest.files[kit.stairsLanding]
  if (!flight || !landing) return []
  const entry = floor.stairsEntrySlot
  const runLen = flight.bbox.max[2] - flight.bbox.min[2]
  const flightW = flight.bbox.max[0] - flight.bbox.min[0]
  const half = storey / 2
  const cx = entry.x + 0.3 + flightW
  const cz = entry.z
  // Flights run along floor-local z; the second one comes back beside the first.
  return [
    vertical(floor, kit.stairsFlight, cx - flightW / 2, cz, Math.PI, [1, 1, 1]),
    vertical(
      floor,
      kit.stairsLanding,
      cx,
      cz + runLen / 2 + (landing.bbox.max[2] - landing.bbox.min[2]) / 2,
      Math.PI,
      [1, 1, 1],
      half,
    ),
    vertical(floor, kit.stairsFlight, cx + flightW / 2, cz, 0, [1, 1, 1], half),
  ]
}

/** Walls, terrace rails, elevator bank and stairs for the whole building. */
export function buildShellPlacements(
  layout: Pick<BuildingLayout, 'floors' | 'floorHeight' | 'elevatorCarCount'>,
  kit: FurnitureKit,
  manifest: AssetManifest,
  slabThickness = 0.3,
): Placement[] {
  const storey = layout.floorHeight - slabThickness
  const out: Placement[] = []
  layout.floors.forEach((floor, i) => {
    for (const wall of floor.walls) {
      out.push(...wallPlacements(floor, wall, kit, manifest, storey))
    }
    if (floor.kind === 'boss') out.push(...terracePlacements(floor, kit, manifest))
    out.push(...elevatorPlacements(floor, kit, manifest, layout.elevatorCarCount))
    out.push(
      ...stairPlacements(floor, kit, manifest, layout.floorHeight, i === layout.floors.length - 1),
    )
  })
  return out
}

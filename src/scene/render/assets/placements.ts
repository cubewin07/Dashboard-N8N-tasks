import type { Slot } from '@/domain/config'
import type { BuildingLayout, FloorLayout } from '@/scene/layout'
import { toWorldX, toWorldZ } from '../coords'
import type { FurnitureMap, ModelRef, SlotArt } from './furnitureMap'
import type { AssetManifest, ManifestEntry } from './manifest'

/**
 * One model instance in world space. Pure data: no three.js here, so the whole
 * mapping from layout to scene is unit-testable.
 */
export interface Placement {
  /** Manifest key of the model. */
  model: string
  /** Optional node filter (one named node of the file). */
  node?: string
  floorKey: string
  floorIndex: number
  /** Slot this instance belongs to, or `null` for shell and dressing. */
  slotId: string | null
  /** True for the slot's main model (the one a fallback box stands in for). */
  primary: boolean
  position: [number, number, number]
  /** three.js Y rotation in radians. */
  rotY: number
  scale: [number, number, number]
}

/** Stable 0..1 hash of a string (FNV-1a). */
export function hash01(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return ((h >>> 0) % 100000) / 100000
}

/** three.js-style rotation about +Y of the point (x, z). */
export function rotateY(angle: number, x: number, z: number): [number, number] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x * c + z * s, -x * s + z * c]
}

/**
 * Slot rotation to three.js rotation. Models face −Z ("front" = the side a
 * person uses), floor-local z runs front to back while world Z runs back to
 * front, hence the half turn.
 */
export function slotRotationToWorld(slotRotY: number): number {
  return Math.PI - slotRotY
}

export function resolveSlotArt(
  map: FurnitureMap,
  templateKey: string,
  slot: Pick<Slot, 'id' | 'type'>,
): SlotArt | null {
  const idBase = slot.id.replace(/_\d+$/, '')
  const keys = [slot.id, idBase, slot.type]
  const tables = [map.templates?.[templateKey]?.slots, map.slots]
  // The most specific key wins; at equal specificity the template override wins.
  for (const key of keys) {
    for (const table of tables) {
      const art = table?.[key]
      if (art) return art
    }
  }
  return null
}

export function pickVariant(models: readonly ModelRef[], seed: string): ModelRef | null {
  if (models.length === 0) return null
  const total = models.reduce((sum, m) => sum + (m.weight ?? 1), 0)
  let target = hash01(seed) * total
  for (const m of models) {
    target -= m.weight ?? 1
    if (target < 0) return m
  }
  return models[models.length - 1] ?? null
}

function seatAnchor(entry: ManifestEntry | undefined) {
  return entry?.anchors.find((a) => a.kind === 'seat')
}

function slotPlacements(
  floor: FloorLayout,
  slot: Slot,
  map: FurnitureMap,
  manifest: AssetManifest,
): Placement[] {
  const art = resolveSlotArt(map, floor.templateKey, slot)
  if (!art) return []
  const seed = `${floor.key}/${slot.id}`
  const main = pickVariant(art.models, seed)
  if (!main || !manifest.files[main.model]) return []

  const { w, d } = floor.size
  const ox = toWorldX(slot.x, w)
  const oz = toWorldZ(slot.z, d)
  const theta = slotRotationToWorld(slot.rotY) + (main.rotY ?? 0)
  const base = { floorKey: floor.key, floorIndex: floor.index, slotId: slot.id }
  const out: Placement[] = [
    {
      ...base,
      model: main.model,
      node: main.node,
      primary: true,
      position: [ox, floor.y, oz],
      rotY: theta,
      scale: [1, 1, 1],
    },
  ]

  const mainEntry = manifest.files[main.model]
  for (const comp of art.companions ?? []) {
    const compEntry = manifest.files[comp.model]
    if (!compEntry) continue
    if (comp.chance !== undefined && hash01(`${seed}/${comp.model}`) >= comp.chance) continue

    // Local pose of the companion in the main model's space.
    const poses: Array<{ x: number; y: number; z: number; rot: number }> = []
    if (comp.anchor) {
      const own = comp.anchor === 'seat' ? seatAnchor(compEntry) : undefined
      for (const anchor of mainEntry?.anchors ?? []) {
        if (anchor.kind !== comp.anchor) continue
        if (own) {
          // Seat on seat: turn the chair so both sitters face the same way.
          const rot = anchor.rotY - own.rotY + (comp.rotY ?? 0)
          const [sx, sz] = rotateY(rot, own.pos[0], own.pos[2])
          poses.push({ x: anchor.pos[0] - sx, y: 0, z: anchor.pos[2] - sz, rot })
        } else {
          poses.push({
            x: anchor.pos[0],
            y: anchor.pos[1],
            z: anchor.pos[2],
            rot: anchor.rotY + (comp.rotY ?? 0),
          })
        }
      }
    } else {
      const [x, y, z] = comp.offset ?? [0, 0, 0]
      poses.push({ x, y, z, rot: comp.rotY ?? 0 })
    }

    for (const pose of poses) {
      const [dx, dz] = rotateY(theta, pose.x, pose.z)
      out.push({
        ...base,
        model: comp.model,
        node: comp.node,
        primary: false,
        position: [ox + dx, floor.y + pose.y, oz + dz],
        rotY: theta + pose.rot,
        scale: [1, 1, 1],
      })
    }
  }
  return out
}

function extraPlacements(
  floor: FloorLayout,
  map: FurnitureMap,
  manifest: AssetManifest,
): Placement[] {
  const extras = map.templates?.[floor.templateKey]?.extras ?? []
  const { w, d } = floor.size
  const out: Placement[] = []
  for (const extra of extras) {
    if (!manifest.files[extra.model]) continue
    out.push({
      model: extra.model,
      node: extra.node,
      floorKey: floor.key,
      floorIndex: floor.index,
      slotId: null,
      primary: false,
      position: [toWorldX(extra.x, w), floor.y + (extra.y ?? 0), toWorldZ(extra.z, d)],
      rotY: slotRotationToWorld(extra.rotY ?? 0),
      scale: [1, 1, 1],
    })
  }
  return out
}

/** Furniture and dressing for the whole building, in floor then slot order. */
export function buildFurniturePlacements(
  layout: Pick<BuildingLayout, 'floors'>,
  map: FurnitureMap,
  manifest: AssetManifest,
): Placement[] {
  const out: Placement[] = []
  for (const floor of layout.floors) {
    for (const slot of floor.slots) {
      out.push(...slotPlacements(floor, slot, map, manifest))
    }
    out.push(...extraPlacements(floor, map, manifest))
  }
  return out
}

/** `floorKey/slotId` of every slot whose main model is in `ready`. */
export function slotsWithModels(
  placements: readonly Placement[],
  isReady: (model: string) => boolean,
): Set<string> {
  const keys = new Set<string>()
  for (const p of placements) {
    if (p.primary && p.slotId && isReady(p.model)) keys.add(`${p.floorKey}/${p.slotId}`)
  }
  return keys
}

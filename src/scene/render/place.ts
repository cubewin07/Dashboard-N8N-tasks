import type * as THREE from 'three'
import type { FloorLayout } from '@/scene/layout'
import { toWorldX, toWorldZ } from './coords'

/** Desk top height shared by every workspace slot (blockoutSpec). */
export const DESK_TOP = 0.74

/**
 * Writes the world transform of a point given in a slot's local frame
 * (same convention as `Blockout`: +z towards the slot's front, yaw
 * mirrored because world z runs opposite to floor z).
 */
export function placeInSlot(
  out: THREE.Object3D,
  floor: FloorLayout,
  slot: { x: number; z: number; rotY: number },
  local: readonly [number, number, number],
  extraYaw = 0,
): THREE.Object3D {
  const cos = Math.cos(slot.rotY)
  const sin = Math.sin(slot.rotY)
  const [lx, ly, lz] = local
  const x = slot.x + lx * cos + lz * sin
  const z = slot.z - lx * sin + lz * cos
  out.position.set(toWorldX(x, floor.size.w), floor.y + ly, toWorldZ(z, floor.size.d))
  out.rotation.set(0, -slot.rotY + extraYaw, 0)
  return out
}

/** Focused floor index while in floor mode (floors above it are cut away). */
export function activeFloorIndexOf(
  layout: { byKey: Record<string, number> },
  view: { mode: string; focusedFloorKey: string | null },
): number | null {
  if (view.mode !== 'floor' || !view.focusedFloorKey) return null
  return layout.byKey[view.focusedFloorKey] ?? null
}

/** A floor whose small props hide, like people do, when it is cut away. */
export function isCutAway(floorIndex: number, active: number | null): boolean {
  return active !== null && floorIndex > active
}

/** Height of the elevator shaft: the whole building, or up to the focused floor's slab. */
export function shaftHeight(totalHeight: number, floorHeight: number, active: number | null): number {
  if (active === null) return totalHeight
  return Math.min(totalHeight, (active + 1) * floorHeight)
}

/** Stair flights still drawn: flight i joins floor i and i + 1, so floors above the focus lose theirs. */
export function visibleFlights(flightCount: number, active: number | null): number {
  if (active === null) return flightCount
  return Math.max(0, Math.min(flightCount, active))
}

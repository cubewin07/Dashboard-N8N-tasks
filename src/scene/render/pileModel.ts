import type { OrgConfig } from '@/domain/config'
import type { EmployeeId } from '@/domain/primitives'
import { makeRng } from '@/scene/director/rng'
import { pileSheets, pileVisualCount } from '@/scene/director/transit'
import type { BuildingLayout } from '@/scene/layout'

/**
 * P05-T05 pure pile model: who has a pile, where it stands, how many sheets
 * are drawn and what the label says. The render side (`DocPiles.tsx`) only
 * turns this into instance matrices.
 */

export interface PileSheet {
  /** Offsets in the anchor's local frame (m) and yaw jitter (rad). */
  dx: number
  dz: number
  rotY: number
}

export interface PileInstances {
  /** Sheets drawn (capped at `maxSheets`). */
  sheets: number
  /** Count label: the full visual count; '' for an empty pile. */
  label: string
}

/** 45 items, none in transit, max 30 → 30 sheets and the label "45". */
export function pileInstances(domainCount: number, inTransit: number, maxSheets: number): PileInstances {
  const count = pileVisualCount(domainCount, inTransit)
  return { sheets: pileSheets(count, maxSheets), label: count > 0 ? String(count) : '' }
}

const JITTER_XZ = 0.012
const JITTER_YAW = 0.07

/** Deterministic small jitter per sheet, seeded by the pile id (no Math.random). */
export function sheetJitter(pileId: string, maxSheets: number): PileSheet[] {
  const rng = makeRng(`pile:${pileId}`)
  const out: PileSheet[] = []
  for (let i = 0; i < maxSheets; i += 1) {
    out.push({
      dx: (rng() * 2 - 1) * JITTER_XZ,
      dz: (rng() * 2 - 1) * JITTER_XZ,
      rotY: (rng() * 2 - 1) * JITTER_YAW,
    })
  }
  return out
}

/** Employees who get a pile: roles with `caps.approveLevel`, and owners (R4). */
export function pileOwnerIds(config: OrgConfig): EmployeeId[] {
  const roles = new Map(config.roles.map((r) => [r.key, r]))
  const ids: EmployeeId[] = []
  for (const e of config.employees) {
    if (e.state !== 'active') continue
    const caps = roles.get(e.roleKey)?.caps
    if (!caps) continue
    if (caps.approveLevel != null || caps.humanOwner) ids.push(e.id)
  }
  return ids
}

export interface PileAnchor {
  employeeId: EmployeeId
  floorIndex: number
  /** Floor-local metres. */
  x: number
  z: number
  rotY: number
}

/** The `.pile` anchor of each owner's desk; owners without a seat are skipped. */
export function pileAnchors(layout: BuildingLayout, ownerIds: readonly EmployeeId[]): PileAnchor[] {
  const out: PileAnchor[] = []
  for (const id of ownerIds) {
    const seat = layout.seatOf[id]
    if (!seat) continue
    const floorIndex = layout.byKey[seat.floorKey]
    if (floorIndex === undefined) continue
    const floor = layout.floors[floorIndex]
    const slot = floor?.slots.find((s) => s.id === `${seat.slotId}.pile`)
    if (!slot) continue
    out.push({ employeeId: id, floorIndex, x: slot.x, z: slot.z, rotY: slot.rotY })
  }
  return out
}

import type { FloorTemplate, Slot, SlotType } from '@/domain/config'

const WORKSPACE_SLOT_TYPES: ReadonlySet<SlotType> = new Set([
  'desk',
  'review_desk',
  'private_office',
  'manager_office',
  'boss_desk',
])

function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Generates 2x2 facing desk clusters inside `template.deskArea.rect`.
 * - Cluster count = clamp(ceil(deskPeopleCount / 4), minClusters, maxClusters)
 *   where minClusters = 2 on main floor (annexIndex === 0) and 1 on annex floors.
 * - Up to 4 clusters (= 16 desks) arranged on a 2x2 cluster grid inside `deskArea.rect`.
 * - Stable IDs: `desk_1` .. `desk_n` in cluster order.
 */
export function generateDeskClusterSlots(
  template: FloorTemplate,
  deskPeopleCount: number,
  annexIndex = 0,
): Slot[] {
  const { deskArea, gridCell } = template
  if (!deskArea) {
    return []
  }

  const { rect, cluster, spacing, capacity } = deskArea
  const clusterSize = cluster.cols * cluster.rows
  const maxClusters = Math.max(1, Math.floor(capacity / clusterSize))
  const minClusters = annexIndex === 0 ? Math.min(2, maxClusters) : 1
  const requestedClusters = Math.ceil(Math.max(0, deskPeopleCount) / clusterSize)
  const clusterCount = Math.min(maxClusters, Math.max(minClusters, requestedClusters))

  const slots: Slot[] = []
  let deskIndex = 1

  const halfColSpan = ((cluster.cols - 1) * spacing) / 2
  const rowDepthSpacing = 1.2
  const halfRowSpan = ((cluster.rows - 1) * rowDepthSpacing) / 2

  for (let c = 0; c < clusterCount; c += 1) {
    const clusterCol = c % 2
    const clusterRow = Math.floor(c / 2)

    const centerX = rect.x + rect.w * (0.27 + clusterCol * 0.46)
    const centerZ = rect.z + rect.d * (0.28 + clusterRow * 0.44)

    for (let r = 0; r < cluster.rows; r += 1) {
      for (let col = 0; col < cluster.cols; col += 1) {
        const x = roundCoord(centerX - halfColSpan + col * spacing)
        const z = roundCoord(centerZ - halfRowSpan + r * rowDepthSpacing)
        const rotY = r === 0 ? 0 : Math.PI

        const cellCol = Math.floor(x / gridCell)
        const cellRow = Math.floor(z / gridCell)
        const approachRow = r === 0 ? Math.max(0, cellRow - 1) : cellRow + 1

        slots.push({
          id: `desk_${deskIndex}`,
          type: 'desk',
          x,
          z,
          rotY,
          roleHint: 'worker',
          footprint: [[cellCol, cellRow]],
          approach: [cellCol, approachRow],
        })
        deskIndex += 1
      }
    }
  }

  return slots
}

/**
 * Generates `<slotId>.pile` child slots on the front-right corner of every
 * workspace desk (`desk`, `review_desk`, `private_office`, `manager_office`, `boss_desk`).
 */
export function generatePileAnchorSlots(slots: readonly Slot[]): Slot[] {
  const pileSlots: Slot[] = []
  const localDx = 0.42
  const localDz = 0.14

  for (const slot of slots) {
    if (!WORKSPACE_SLOT_TYPES.has(slot.type)) {
      continue
    }
    const cos = Math.cos(slot.rotY)
    const sin = Math.sin(slot.rotY)
    const x = roundCoord(slot.x + localDx * cos + localDz * sin)
    const z = roundCoord(slot.z - localDx * sin + localDz * cos)

    pileSlots.push({
      id: `${slot.id}.pile`,
      type: 'pile_anchor',
      parentSlotId: slot.id,
      x,
      z,
      rotY: slot.rotY,
      footprint: slot.footprint ?? [[Math.floor(x / 0.5), Math.floor(z / 0.5)]],
      approach: slot.approach ?? [Math.floor(x / 0.5), Math.floor(z / 0.5)],
    })
  }

  return pileSlots
}

/**
 * Builds the complete slot list for a floor: fixedSlots + generated desk cluster slots
 * + generated `.pile` anchor child slots.
 */
export function buildFloorSlots(
  template: FloorTemplate,
  deskPeopleCount: number,
  annexIndex = 0,
): Slot[] {
  const fixed = template.fixedSlots.map((s) => ({ ...s }))
  const generatedDesks = generateDeskClusterSlots(template, deskPeopleCount, annexIndex)
  const baseSlots = [...fixed, ...generatedDesks]
  const pileAnchors = generatePileAnchorSlots(baseSlots)
  return [...baseSlots, ...pileAnchors]
}

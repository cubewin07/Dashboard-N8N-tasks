import type { EmployeeId } from '@/domain/primitives'
import type { BuildingLayout, FloorLayout } from '@/scene/layout'
import { route } from '@/scene/nav/routeGraph'
import type { NavGrid, Vec2 } from '@/scene/nav/types'
import { INTENT_VERTICAL_MODE, type Intent } from './intents'
import { SlotLedger } from './slots'
import { approachOf, cellCentre, chairPoint, findSlot, isDeskSlot, stationFor } from './stations'
import { TUNING } from './tuning'
import type { Action, Station, VerticalMode } from './types'

export interface PlanPerson {
  id: EmployeeId
  floorIndex: number
  pos: Vec2
  /** Where the person is settled right now (they must stand up first). */
  station: Station | null
}

export interface PlanContext {
  layout: BuildingLayout
  grid: (floorIndex: number) => NavGrid
  ledger: SlotLedger
  /** Own workspace; the director guarantees one for everybody. */
  deskOf: (id: EmployeeId) => Station | null
  /** Pre-drawn start delay (visual seconds) for leisure plans. */
  jitterSeconds: number
}

interface Cursor {
  floor: number
}

function travel(
  out: Action[],
  cursor: Cursor,
  ctx: PlanContext,
  toFloor: number,
  toPoint: Vec2,
  mode: VerticalMode,
): void {
  const segments = route(
    ctx.layout,
    { floor: cursor.floor, point: toPoint },
    { floor: toFloor, point: toPoint },
    mode,
    { lobbyInset: TUNING.elevator.lobbyInset },
  )
  for (const seg of segments) {
    if (seg.k === 'walk') {
      out.push({ k: 'walk', floor: seg.floor, to: seg.to })
    } else if (seg.mode === 'elevator') {
      out.push({ k: 'callElevator', floor: seg.from, to: seg.to })
      out.push({ k: 'ride', to: seg.to })
      out.push({ k: 'exitElevator', floor: seg.to })
    } else {
      out.push({ k: 'stairs', from: seg.from, to: seg.to })
    }
  }
  cursor.floor = toFloor
}

const chairCellCache = new WeakMap<FloorLayout, Set<number>>()

function chairCells(floor: FloorLayout, grid: NavGrid): Set<number> {
  let cells = chairCellCache.get(floor)
  if (!cells) {
    cells = new Set()
    for (const slot of floor.slots) {
      if (!isDeskSlot(slot)) continue
      const [col, row] = grid.toCell(chairPoint(slot))
      cells.add(row * grid.w + col)
    }
    chairCellCache.set(floor, cells)
  }
  return cells
}

/**
 * Free cells by somebody's desk where visitors stand (couriers, people
 * asking, people being helped): the slot's approach cell and its neighbours,
 * never a chair cell, nearest to the paper pile first. Deterministic.
 */
export function visitorPoints(floor: FloorLayout, grid: NavGrid, station: Station): Vec2[] {
  const [ac, ar] = grid.toCell(approachOf(station.slot))
  const chairs = chairCells(floor, grid)
  const pile = findSlot(floor, `${station.slot.id}.pile`)
  const anchor: Vec2 = pile ? { x: pile.x, z: pile.z } : { x: station.slot.x, z: station.slot.z }
  const found: Array<{ p: Vec2; d: number; col: number; row: number }> = []
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      const col = ac + dc
      const row = ar + dr
      if (grid.isBlocked(col, row)) continue
      if (chairs.has(row * grid.w + col)) continue
      const p = grid.toWorld(col, row)
      found.push({ p, d: Math.hypot(p.x - anchor.x, p.z - anchor.z), col, row })
    }
  }
  found.sort((a, b) => a.d - b.d || a.row - b.row || a.col - b.col)
  return found.slice(0, 6).map((f) => f.p)
}

function visitorPoint(ctx: PlanContext, target: Station, id: EmployeeId): Vec2 {
  const floor = ctx.layout.floors[target.floorIndex]!
  const points = visitorPoints(floor, ctx.grid(target.floorIndex), target)
  if (points.length === 0) return target.approach
  // Spread visitors of the same desk over the nearest spots.
  const key = SlotLedger.key(floor.key, `${target.slot.id}#visit`)
  const place = ctx.ledger.reserve(key, id, points.length)
  return points[place >= 0 ? place : 0]!
}

function standUp(out: Action[], me: PlanPerson): void {
  if (me.station) out.push({ k: 'stand' })
}

function toStation(
  out: Action[],
  cursor: Cursor,
  ctx: PlanContext,
  station: Station,
  mode: VerticalMode,
): void {
  travel(out, cursor, ctx, station.floorIndex, station.approach, mode)
  out.push({ k: 'sit', station })
}

function entrancePoint(layout: BuildingLayout): { floor: number; point: Vec2 } {
  for (const floor of layout.floors) {
    const slot = floor.slots.find((s) => s.type === 'entrance')
    if (slot) {
      return {
        floor: floor.index,
        point: slot.approach ? cellCentre(slot.approach) : { x: slot.x, z: slot.z },
      }
    }
  }
  const ground = layout.floors[0]!
  return { floor: 0, point: cellCentre(ground.stairsEntrySlot.approach ?? [40, 8]) }
}

export { entrancePoint }

/**
 * Intent → concrete steps (§3.4). Reserves shared destination slots in the
 * ledger; a full waiting area degrades to standing by the desk.
 */
export function plan(intent: Intent, me: PlanPerson, ctx: PlanContext): Action[] {
  const out: Action[] = []
  const cursor: Cursor = { floor: me.floorIndex }
  const mode: VerticalMode = INTENT_VERTICAL_MODE[intent.kind] ?? 'elevator'
  const desk = ctx.deskOf(me.id)
  const atDesk = Boolean(desk && me.station && me.station.isDesk)

  switch (intent.kind) {
    case 'WorkAtDesk':
      out.push({ k: 'hold', pose: intent.pose })
      return out

    case 'ReviewAtDesk':
      out.push({ k: 'hold', pose: 'sit_read' })
      return out

    case 'GoToDesk':
    case 'ReturnToDesk':
    case 'Arrive': {
      if (!desk) return out
      standUp(out, me)
      toStation(out, cursor, ctx, desk, mode)
      return out
    }

    case 'DeliverDocument': {
      const target = ctx.deskOf(intent.toEmployeeId)
      if (!target) {
        out.push({ k: 'drop', item: 'document', at: '', errandId: intent.errandId })
        return out
      }
      standUp(out, me)
      out.push({ k: 'pick', item: 'document' })
      travel(out, cursor, ctx, target.floorIndex, visitorPoint(ctx, target, me.id), mode)
      out.push({ k: 'face', toward: { x: target.slot.x, z: target.slot.z } })
      // R6: review papers join the approver's pile; handed-off / assigned
      // work is put on the new owner's desk.
      out.push({
        k: 'drop',
        item: 'document',
        at: SlotLedger.key(
          target.floorKey,
          intent.reviewId ? `${target.slot.id}.pile` : target.slot.id,
        ),
        errandId: intent.errandId,
      })
      out.push({ k: 'wait', seconds: TUNING.dropWaitSeconds })
      return out
    }

    case 'GoAsk': {
      const target = ctx.deskOf(intent.toEmployeeId)
      if (!target || !desk) {
        out.push({ k: 'emote', kind: 'think', seconds: 0, markAsked: intent.questionId })
        return out
      }
      standUp(out, me)
      travel(out, cursor, ctx, target.floorIndex, visitorPoint(ctx, target, me.id), mode)
      out.push({ k: 'face', toward: target.seat })
      out.push({
        k: 'emote',
        kind: 'talk',
        seconds: TUNING.askChatSeconds,
        markAsked: intent.questionId,
      })
      toStation(out, cursor, ctx, desk, mode)
      return out
    }

    case 'WaitInSeat': {
      const target = ctx.deskOf(intent.nearEmployeeId)
      if (!target) {
        out.push({ k: 'hold', pose: 'wait_seat' })
        return out
      }
      const floor = ctx.layout.floors[target.floorIndex]!
      standUp(out, me)
      for (const slot of floor.slots) {
        if (slot.type !== 'waiting_seat') continue
        const key = SlotLedger.key(floor.key, slot.id)
        if (ctx.ledger.reserve(key, me.id, 1) < 0) continue
        toStation(out, cursor, ctx, stationFor(floor, slot), mode)
        out.push({ k: 'hold', pose: 'wait_seat' })
        return out
      }
      // Every seat is taken: stand in line by the desk.
      travel(out, cursor, ctx, target.floorIndex, visitorPoint(ctx, target, me.id), mode)
      out.push({ k: 'face', toward: target.seat })
      out.push({ k: 'hold', pose: 'wait_stand' })
      return out
    }

    case 'HelpAt': {
      const helper = ctx.deskOf(intent.helperId)
      if (!helper) {
        out.push({ k: 'hold', pose: 'wait_seat' })
        return out
      }
      standUp(out, me)
      travel(out, cursor, ctx, helper.floorIndex, visitorPoint(ctx, helper, me.id), mode)
      out.push({ k: 'face', toward: helper.seat })
      out.push({ k: 'hold', pose: 'talk' })
      return out
    }

    case 'MeetAt': {
      const home = desk ? ctx.layout.floors[desk.floorIndex] : ctx.layout.floors[me.floorIndex]
      const table = home?.slots.find((s) => s.type === 'meeting_table')
      if (home && table) {
        const key = SlotLedger.key(home.key, table.id)
        const place = ctx.ledger.reserve(key, me.id, table.capacity ?? 4)
        if (place >= 0) {
          standUp(out, me)
          toStation(out, cursor, ctx, stationFor(home, table, place), mode)
          out.push({ k: 'hold', pose: 'sit' })
          return out
        }
      }
      if (desk && !atDesk) {
        standUp(out, me)
        toStation(out, cursor, ctx, desk, mode)
      }
      out.push({ k: 'hold', pose: 'sit' })
      return out
    }

    case 'Leave': {
      const exit = entrancePoint(ctx.layout)
      standUp(out, me)
      travel(out, cursor, ctx, exit.floor, exit.point, mode)
      out.push({ k: 'despawn' })
      return out
    }

    case 'IdleAtDesk':
    case 'NapAtDesk': {
      const pose = intent.kind === 'NapAtDesk' ? 'nap_desk' : 'sit'
      if (desk && !atDesk) {
        if (ctx.jitterSeconds > 0) out.push({ k: 'wait', seconds: ctx.jitterSeconds })
        standUp(out, me)
        toStation(out, cursor, ctx, desk, mode)
      }
      out.push({ k: 'hold', pose })
      return out
    }

    case 'IdleWander':
    case 'RestOnLeisureFloor': {
      const floorIndex = ctx.layout.byKey[intent.floorKey]
      const floor = floorIndex === undefined ? undefined : ctx.layout.floors[floorIndex]
      const slot = floor ? findSlot(floor, intent.slotId) : null
      if (!floor || !slot) {
        out.push({ k: 'hold', pose: 'sit' })
        return out
      }
      const key = SlotLedger.key(floor.key, slot.id)
      const place = Math.max(0, ctx.ledger.reserve(key, me.id, slot.capacity ?? 1))
      const station = stationFor(floor, slot, place)
      if (ctx.jitterSeconds > 0) out.push({ k: 'wait', seconds: ctx.jitterSeconds })
      standUp(out, me)
      toStation(out, cursor, ctx, station, mode)
      out.push({ k: 'hold', pose: station.pose })
      return out
    }

    default: {
      const exhaustive: never = intent
      return exhaustive
    }
  }
}

/** Grep-friendly proof of R5: the vertical steps a plan contains. */
export function verticalStepsOf(actions: readonly Action[]): Array<'elevator' | 'stairs'> {
  const modes: Array<'elevator' | 'stairs'> = []
  for (const a of actions) {
    if (a.k === 'callElevator') modes.push('elevator')
    else if (a.k === 'stairs') modes.push('stairs')
  }
  return modes
}

import type * as THREE from 'three'
import type { Slot, SlotType } from '@/domain/config'
import { decorKind } from './decorModel'
import { SCENE_PALETTE } from './palette'

export type BlockoutMeshKind =
  | 'desk'
  | 'review_desk'
  | 'private_office'
  | 'manager_office'
  | 'boss_desk'
  | 'task_chair'
  | 'waiting_seat'
  | 'meeting_table'
  | 'entrance_mat'
  | 'sofa'
  | 'coffee_counter'
  | 'tea_table'
  | 'water_cooler'
  | 'pingpong'
  | 'arcade'
  | 'boardgame'
  | 'karaoke'
  | 'bed'
  | 'massage_chair'
  | 'plant_pot'
  | 'plant_foliage'

export interface BlockoutPart {
  kind: BlockoutMeshKind
  size: [number, number, number]
  localOffset: [number, number, number]
  color: THREE.Color
}

export type BlockoutSpec =
  | { render: false }
  | {
      render: true
      parts: readonly BlockoutPart[]
    }

const P = SCENE_PALETTE.blockout

/**
 * Exhaustive mapping from every SlotType to its blockout geometry specification.
 * Seat height = 0.45m, desk height = 0.74m, bed height = 0.40m so P04 characters
 * align without re-tuning.
 */
export const SLOT_BLOCKOUT: Record<SlotType, BlockoutSpec> = {
  desk: {
    render: true,
    parts: [
      {
        kind: 'desk',
        size: [1.2, 0.74, 0.65],
        localOffset: [0, 0.37, 0],
        color: P.deskWood,
      },
      {
        kind: 'task_chair',
        size: [0.46, 0.45, 0.46],
        localOffset: [0, 0.225, -0.55],
        color: P.chairDark,
      },
    ],
  },
  review_desk: {
    render: true,
    parts: [
      {
        kind: 'review_desk',
        size: [1.35, 0.74, 0.7],
        localOffset: [0, 0.37, 0],
        color: P.reviewDesk,
      },
      {
        kind: 'task_chair',
        size: [0.48, 0.45, 0.48],
        localOffset: [0, 0.225, -0.58],
        color: P.chairDark,
      },
    ],
  },
  private_office: {
    render: true,
    parts: [
      {
        kind: 'private_office',
        size: [1.6, 0.74, 0.8],
        localOffset: [0, 0.37, 0],
        color: P.privateDesk,
      },
      {
        kind: 'task_chair',
        size: [0.52, 0.45, 0.52],
        localOffset: [0, 0.225, -0.65],
        color: P.chairDark,
      },
    ],
  },
  manager_office: {
    render: true,
    parts: [
      {
        kind: 'manager_office',
        size: [1.8, 0.74, 0.85],
        localOffset: [0, 0.37, 0],
        color: P.managerDesk,
      },
      {
        kind: 'task_chair',
        size: [0.54, 0.45, 0.54],
        localOffset: [0, 0.225, -0.68],
        color: P.chairDark,
      },
    ],
  },
  boss_desk: {
    render: true,
    parts: [
      {
        kind: 'boss_desk',
        size: [2.0, 0.74, 0.9],
        localOffset: [0, 0.37, 0],
        color: P.bossDesk,
      },
      {
        kind: 'task_chair',
        size: [0.56, 0.45, 0.56],
        localOffset: [0, 0.225, -0.72],
        color: P.chairDark,
      },
    ],
  },
  pile_anchor: { render: false },
  waiting_seat: {
    render: true,
    parts: [
      {
        kind: 'waiting_seat',
        size: [0.5, 0.45, 0.5],
        localOffset: [0, 0.225, 0],
        color: P.waitingChair,
      },
    ],
  },
  elevator_door: { render: false },
  stairs_entry: { render: false },
  meeting_table: {
    render: true,
    parts: [
      {
        kind: 'meeting_table',
        size: [2.4, 0.74, 1.2],
        localOffset: [0, 0.37, 0],
        color: P.meetingTable,
      },
    ],
  },
  entrance: {
    render: true,
    parts: [
      {
        kind: 'entrance_mat',
        size: [1.2, 0.04, 1.6],
        localOffset: [0, 0.02, 0],
        color: P.entranceMat,
      },
    ],
  },
  idle_sofa: {
    render: true,
    parts: [
      {
        kind: 'sofa',
        size: [1.7, 0.45, 0.8],
        localOffset: [0, 0.225, 0],
        color: P.sofaTeal,
      },
    ],
  },
  idle_coffee: {
    render: true,
    parts: [
      {
        kind: 'coffee_counter',
        size: [1.5, 0.9, 0.7],
        localOffset: [0, 0.45, 0],
        color: P.coffeeCounter,
      },
    ],
  },
  idle_tea_table: {
    render: true,
    parts: [
      {
        kind: 'tea_table',
        size: [1.0, 0.72, 1.0],
        localOffset: [0, 0.36, 0],
        color: P.teaTable,
      },
    ],
  },
  idle_water: {
    render: true,
    parts: [
      {
        kind: 'water_cooler',
        size: [0.45, 1.15, 0.45],
        localOffset: [0, 0.575, 0],
        color: P.waterCooler,
      },
    ],
  },
  idle_window: { render: false },
  idle_chat: { render: false },
  idle_pingpong: {
    render: true,
    parts: [
      {
        kind: 'pingpong',
        size: [2.4, 0.76, 1.4],
        localOffset: [0, 0.38, 0],
        color: P.pingpongTable,
      },
    ],
  },
  idle_arcade: {
    render: true,
    parts: [
      {
        kind: 'arcade',
        size: [0.8, 1.65, 0.8],
        localOffset: [0, 0.825, 0],
        color: P.arcadeCabinet,
      },
    ],
  },
  idle_boardgame: {
    render: true,
    parts: [
      {
        kind: 'boardgame',
        size: [1.2, 0.74, 1.2],
        localOffset: [0, 0.37, 0],
        color: P.boardgameTable,
      },
    ],
  },
  idle_karaoke: {
    render: true,
    parts: [
      {
        kind: 'karaoke',
        size: [1.8, 2.1, 1.6],
        localOffset: [0, 1.05, 0],
        color: P.karaokeBooth,
      },
    ],
  },
  idle_bed: {
    render: true,
    parts: [
      {
        kind: 'bed',
        size: [0.95, 0.4, 1.85],
        localOffset: [0, 0.2, 0],
        color: P.napBed,
      },
    ],
  },
  idle_massage_chair: {
    render: true,
    parts: [
      {
        kind: 'massage_chair',
        size: [0.85, 0.45, 1.1],
        localOffset: [0, 0.225, 0],
        color: P.massageChair,
      },
    ],
  },
  decor: {
    render: true,
    parts: [
      {
        kind: 'plant_pot',
        size: [0.42, 0.38, 0.42],
        localOffset: [0, 0.19, 0],
        color: P.plantPot,
      },
      {
        kind: 'plant_foliage',
        size: [0.55, 0.65, 0.55],
        localOffset: [0, 0.68, 0],
        color: P.plantFoliage,
      },
    ],
  },
  cat_spot: { render: false },
}

const NOT_RENDERED: BlockoutSpec = { render: false }

/**
 * Blockout spec for one slot. Decor slots that are not plants (reception
 * counter, task wall) are drawn by `Decor.tsx` instead, so nothing is drawn
 * twice.
 */
export function blockoutFor(slot: Pick<Slot, 'id' | 'type'>): BlockoutSpec {
  if (slot.type === 'decor' && decorKind(slot) !== 'plant') return NOT_RENDERED
  return SLOT_BLOCKOUT[slot.type]
}

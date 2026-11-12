import type { CarriedItem, Slot } from '@/domain/config'
import type { EmployeeId } from '@/domain/primitives'
import type { Vec2 } from '@/scene/nav/types'
import type { PoseKey } from './poses'

export type Carry = CarriedItem
export type VerticalMode = 'elevator' | 'stairs'

/** A place a person occupies: a desk chair, a waiting seat, a sofa, a spot to stand. */
export interface Station {
  floorIndex: number
  floorKey: string
  slot: Slot
  /** Free cell centre a walker reaches by path. */
  approach: Vec2
  /** Where the body ends up (on the chair, on the bed, or the approach itself). */
  seat: Vec2
  /** Facing while using it (floor-local, atan2(dx, dz)). */
  heading: number
  /** Pose while settled. */
  pose: PoseKey
  /** Own allocated workspace (desk, office). */
  isDesk: boolean
}

export type Emote = 'talk' | 'think' | 'wave' | 'stuck'

/**
 * Steps of a plan (§3.4). `walk` resolves its path lazily from the person's
 * real position, because the elevator door they leave from is not known when
 * the plan is made.
 */
export type Action =
  | { k: 'walk'; floor: number; to: Vec2 }
  | { k: 'callElevator'; floor: number; to: number }
  | { k: 'ride'; to: number }
  | { k: 'exitElevator'; floor: number }
  | { k: 'stairs'; from: number; to: number }
  | { k: 'sit'; station: Station }
  | { k: 'stand' }
  | { k: 'pick'; item: Carry }
  | { k: 'drop'; item: Carry; at: string; errandId: string | null }
  | { k: 'wait'; seconds: number; pose?: PoseKey }
  | { k: 'emote'; kind: Emote; seconds: number; markAsked?: string }
  | { k: 'face'; toward: Vec2 }
  | { k: 'hold'; pose: PoseKey }
  | { k: 'despawn' }

export type ActionKind = Action['k']

/** What the renderer reads, per person, per tick. All positions are floor-local metres. */
export interface PersonSim {
  id: EmployeeId
  /** Floor used for fading and focus (nearest floor while riding). */
  floorIndex: number
  x: number
  z: number
  /** Absolute height of the feet in metres (floor.y, or the car while riding). */
  y: number
  prevX: number
  prevZ: number
  prevY: number
  heading: number
  pose: PoseKey
  /** 0 standing … 1 full walking speed (drives the walk bob). */
  speed01: number
  carrying: Carry | null
  opacity: number
  /** False while in the stairwell or before spawning. */
  visible: boolean
  /** Elevator car index while riding, else -1 (the camera tracks the car). */
  inCar: number
}

/** A visual consequence of an event that needs legs: carry a paper to someone. */
export interface Errand {
  id: string
  toEmployeeId: EmployeeId
  reviewId: string | null
  taskId: string | null
  /** Sim time (ms) of the event. */
  atMs: number
}

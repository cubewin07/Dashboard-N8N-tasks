import type * as THREE from 'three'
import type { EmployeeId } from '@/domain/primitives'
import type { PoseKey } from '@/scene/director/poses'
import type { Carry } from '@/scene/director/types'

export type PersonTone = 'working' | 'waiting' | 'blocked'

/**
 * One person, one frame, in world space. This is the seam between "where
 * people are" (the director) and "what people look like": capsules in P04,
 * rigged characters from P07b. Objects are reused between frames: read, do
 * not keep.
 */
export interface PersonVisualInput {
  id: EmployeeId
  /** Feet, world metres. */
  x: number
  y: number
  z: number
  /** World yaw (three.js `rotation.y`; 0 faces +Z). */
  yaw: number
  /** Pose / animation key from `director/poses.ts`. */
  pose: PoseKey
  seated: boolean
  /** 0 standing … 1 full walking speed. */
  speed01: number
  carrying: Carry | null
  /** Palette swatch key (department colour). */
  tintSwatch: string
  /** Status dot; null = no dot (idle). */
  tone: PersonTone | null
  hovered: boolean
  selected: boolean
  followed: boolean
  /** 0 hidden … 1 solid. */
  opacity: number
  /** 0 near … 2 far: an implementation may simplify distant people. */
  lod: 0 | 1 | 2
}

/** One implementation is active at a time. */
export interface PersonVisualSystem {
  /** Add this to the scene. */
  readonly object: THREE.Object3D
  /**
   * Draw the first `count` inputs. `dt` is animation time in seconds: 0
   * while the office is paused, so poses freeze.
   */
  sync(inputs: readonly PersonVisualInput[], count: number, dt: number): void
  /** The person under a world-space ray, nearest first. */
  pick(ray: THREE.Ray): EmployeeId | null
  /** World position just above a person's head (labels). False when not drawn. */
  headOf(id: EmployeeId, out: THREE.Vector3): boolean
  setReducedMotion(reduced: boolean): void
  dispose(): void
}

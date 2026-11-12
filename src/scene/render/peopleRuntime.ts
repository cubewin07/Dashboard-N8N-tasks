import type * as THREE from 'three'
import type { EmployeeId } from '@/domain/primitives'
import type { Director } from '@/scene/director/director'
import type { IndicatorCounts } from './PersonIndicators'

/**
 * What the rest of the scene may ask about people this frame (the follow
 * camera, debug hooks). Written by `<People>`, read by anyone in the canvas.
 * Not React state: it changes every frame.
 */
export interface PersonSight {
  /** Feet, world metres (interpolated). */
  x: number
  y: number
  z: number
  floorKey: string
  /** Riding an elevator car right now. */
  riding: boolean
  visible: boolean
}

export interface PeopleRuntime {
  director: Director | null
  /** Interpolated position of one person; false when they are not in the building. */
  sightOf: (id: EmployeeId, out: PersonSight) => boolean
  pick: (ray: THREE.Ray) => EmployeeId | null
  /** Average director tick cost in ms (debug / perf check). */
  tickMs: number
  /** Movement factor in use (0 = paused). */
  moveFactor: number
  /** Status rings / icons / badges / emotes drawn last frame (P05). */
  indicators: IndicatorCounts
  /** Name labels in use from the pool (0 at overview zoom, P05-T13). */
  namesInUse: number
  /** Status ring pulse amplitude (0 under reduced motion, R14). */
  ringPulse: number
}

function noIndicators(): IndicatorCounts {
  return { rings: 0, icons: 0, badges: 0, emotes: 0 }
}

export const peopleRuntime: PeopleRuntime = {
  director: null,
  sightOf: () => false,
  pick: () => null,
  tickMs: 0,
  moveFactor: 0,
  indicators: noIndicators(),
  namesInUse: 0,
  ringPulse: 0,
}

export function resetPeopleRuntime(): void {
  peopleRuntime.director = null
  peopleRuntime.sightOf = () => false
  peopleRuntime.pick = () => null
  peopleRuntime.tickMs = 0
  peopleRuntime.moveFactor = 0
  peopleRuntime.indicators = noIndicators()
  peopleRuntime.namesInUse = 0
  peopleRuntime.ringPulse = 0
}

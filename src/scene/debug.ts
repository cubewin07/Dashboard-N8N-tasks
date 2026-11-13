import type { EmployeeId } from '@/domain/primitives'
import { usePeopleUi } from '@/office/uiStore'
import type { DirectorStats, PersonDebug } from '@/scene/director/director'
import { lodRuntime } from '@/scene/render/lod'
import { setUnlitQuadVisible, UNLIT_QUAD_POS } from '@/scene/render/Environment'
import { peopleRuntime, type PersonSight } from '@/scene/render/peopleRuntime'

/** One person as the tests and the perf check see them (world metres). */
export interface PersonDebugRow {
  id: string
  x: number
  y: number
  z: number
  floorKey: string
  pose: string
  visible: boolean
  riding: boolean
}

export interface DirectorDebug {
  people: () => PersonDebugRow[]
  /** Intent, action and queue per person. */
  detail: () => PersonDebug[]
  elevators: () => { position: number; door01: number; riders: number }[]
  stats: () => DirectorStats | null
  /** Average cost of one director tick (ms). */
  tickMs: () => number
  /** 0 while the office is paused. */
  moveFactor: () => number
  /** P05: per-person indicators drawn last frame. */
  indicators: () => { rings: number; icons: number; badges: number; emotes: number }
  /** P05-T13: name labels in use (0 at overview zoom). */
  namesInUse: () => number
  /** P05-T14: status ring pulse amplitude (0 under reduced motion). */
  ringPulse: () => number
  /** P05: LOD band per floor index. */
  lodBands: () => string[]
}

export interface CameraDebug {
  follow: (id: string | null) => void
  followedId: () => string | null
  /** Where the camera looks (world metres), or null before the controls exist. */
  target: () => [number, number, number] | null
  /** Where a person's chest is on the page (client pixels), for click tests. */
  screenOf: (id: string) => [number, number] | null
  /** Projected client pixels of the debug unlit reference quad. */
  getUnlitQuadScreen?: () => [number, number] | null
  /** Show or hide the debug unlit reference quad. */
  setUnlitQuadVisible?: (visible: boolean) => void
}

const sight: PersonSight = { x: 0, y: 0, z: 0, floorKey: '', riding: false, visible: false }

/** Dev and E2E only: what `window.__office_debug.director` exposes. */
export const directorDebug: DirectorDebug = {
  people: () => {
    const director = peopleRuntime.director
    if (!director) return []
    const rows: PersonDebugRow[] = []
    for (const p of director.people()) {
      if (!peopleRuntime.sightOf(p.id, sight)) continue
      rows.push({
        id: p.id,
        x: sight.x,
        y: sight.y,
        z: sight.z,
        floorKey: sight.floorKey,
        pose: p.pose,
        visible: sight.visible,
        riding: sight.riding,
      })
    }
    return rows
  },
  detail: () => peopleRuntime.director?.debugPeople() ?? [],
  elevators: () =>
    (peopleRuntime.director?.elevators() ?? []).map((car) => ({
      position: car.position,
      door01: car.door01,
      riders: car.riders.length,
    })),
  stats: () => peopleRuntime.director?.stats() ?? null,
  tickMs: () => peopleRuntime.tickMs,
  moveFactor: () => peopleRuntime.moveFactor,
  indicators: () => ({ ...peopleRuntime.indicators }),
  namesInUse: () => peopleRuntime.namesInUse,
  ringPulse: () => peopleRuntime.ringPulse,
  lodBands: () => [...lodRuntime.bands],
}

export function makeCameraDebug(
  getTarget: () => [number, number, number] | null,
  project: (x: number, y: number, z: number) => [number, number] | null,
): CameraDebug {
  return {
    screenOf: (id) =>
      peopleRuntime.sightOf(id as EmployeeId, sight)
        ? project(sight.x, sight.y + 0.7, sight.z)
        : null,
    follow: (id) => usePeopleUi.getState().follow(id as EmployeeId | null),
    followedId: () => usePeopleUi.getState().followedId,
    target: getTarget,
    getUnlitQuadScreen: () => project(UNLIT_QUAD_POS[0], UNLIT_QUAD_POS[1], UNLIT_QUAD_POS[2]),
    setUnlitQuadVisible,
  }
}

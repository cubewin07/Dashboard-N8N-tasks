import type { EventType } from '@/domain/events'
import type { EmployeeId } from '@/domain/primitives'
import type { OfficeState } from '@/domain/work'
import { getOfficeState, useOffice, usePeopleUi } from '@/office'
import { officeExtensions } from '@/office/extensions'
import { useViewStore, type CameraMode } from '@/scene/camera/viewStore'
import type { TourCameraPort, TourPorts } from './runner'
import type { TourCamera } from './tourSchema'

const BUSY = new Set(['working', 'reviewing', 'delivering'])

/** Whom a `follow` step looks at: someone with that role (and department), busy ones first. */
export function pickFollowTarget(
  state: OfficeState | null,
  roleKey: string,
  departmentKey?: string,
): EmployeeId | null {
  if (!state) return null
  const deptId = departmentKey
    ? state.config.departments.find((d) => d.key === departmentKey)?.id ?? null
    : null
  if (departmentKey && !deptId) return null
  const candidates = state.config.employees.filter(
    (e) => e.state === 'active' && e.roleKey === roleKey && (!deptId || e.departmentId === deptId),
  )
  const busy = candidates.find((e) => BUSY.has(state.people[e.id]?.activity ?? 'idle'))
  return (busy ?? candidates[0])?.id ?? null
}

export interface CameraSnapshot {
  mode: CameraMode
  focusedFloorKey: string | null
  followedId: EmployeeId | null
}

/** The camera rig's public stores: the same ones the camera bar and the people list use. */
export const cameraPort: TourCameraPort<CameraSnapshot> = {
  capture() {
    const v = useViewStore.getState()
    return { mode: v.mode, focusedFloorKey: v.focusedFloorKey, followedId: usePeopleUi.getState().followedId }
  },
  restore(s) {
    const view = useViewStore.getState()
    usePeopleUi.getState().follow(s.followedId)
    if (s.mode === 'floor' && s.focusedFloorKey) view.focusFloor(s.focusedFloorKey)
    else if (s.mode === 'free') view.setFree()
    else view.setOverview()
  },
  show(camera: TourCamera) {
    const view = useViewStore.getState()
    const people = usePeopleUi.getState()
    if (camera.mode === 'follow') {
      const id = pickFollowTarget(getOfficeState(), camera.followRole, camera.departmentKey)
      if (id) {
        people.follow(id)
        return
      }
    }
    people.follow(null)
    if (camera.mode !== 'overview' && camera.floorKey) view.focusFloor(camera.floorKey)
    else view.setOverview()
  },
}

/** New feed events of one type, read from the store's event log by sequence number. */
export function onOfficeEvent(type: EventType, cb: () => void): () => void {
  const maxSeq = (s: OfficeState | null) => s?.log.at(-1)?.seq ?? 0
  let seen = maxSeq(useOffice.getState().state)
  return useOffice.subscribe((store) => {
    const log = store.state?.log
    if (!log) return
    const last = maxSeq(store.state)
    if (last <= seen) {
      seen = last // a reset starts the sequence again
      return
    }
    let hit = false
    for (let i = log.length - 1; i >= 0 && log[i]!.seq > seen; i -= 1) {
      if (log[i]!.type === type) hit = true
    }
    seen = last
    if (hit) cb()
  })
}

export function officeTourPorts(): TourPorts<CameraSnapshot> {
  return { camera: cameraPort, sim: officeExtensions.tourControls, onEvent: onOfficeEvent }
}

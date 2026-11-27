import { create } from 'zustand'
import defaultTourJson from './defaultTour.json'
import { officeTourPorts, type CameraSnapshot } from './ports'
import { TourRunner, type TourView } from './runner'
import { TourSchema } from './tourSchema'

// Validated at the edge like any other config data.
const defaultTour = TourSchema.parse(defaultTourJson)

interface TourStore {
  /** Null while no tour is playing. */
  view: TourView | null
}

export const useTourStore = create<TourStore>(() => ({ view: null }))

let runner: TourRunner<CameraSnapshot> | null = null

export function startTour(): void {
  if (runner) return
  const r = new TourRunner(defaultTour, officeTourPorts())
  runner = r
  r.subscribe((view) => {
    if (view.status === 'idle') {
      if (runner === r) runner = null
      useTourStore.setState({ view: null })
    } else {
      useTourStore.setState({ view })
    }
  })
  r.start()
}

export function toggleTourPause(): void {
  runner?.togglePause()
}

export function nextTourStep(): void {
  runner?.next()
}

export function exitTour(): void {
  runner?.exit()
}

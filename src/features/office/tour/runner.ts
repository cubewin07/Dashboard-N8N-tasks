import type { EventType } from '@/domain/events'
import type { TourControlsApi } from '@/office/extensions'
import type { Tour, TourCamera, TourStep } from './tourSchema'

/** The camera as the tour sees it: the rig's public API, nothing else. */
export interface TourCameraPort<Snapshot = unknown> {
  capture: () => Snapshot
  restore: (snapshot: Snapshot) => void
  show: (camera: TourCamera) => void
}

export interface TourPorts<Snapshot = unknown> {
  camera: TourCameraPort<Snapshot>
  /** Null on real data: `sim` steps are then skipped. */
  sim: TourControlsApi | null
  /** Calls `cb` for every new feed event of this type; returns an unsubscribe. */
  onEvent: (type: EventType, cb: () => void) => () => void
  now?: () => number
}

export type TourStatus = 'idle' | 'running' | 'paused'

export interface TourView {
  status: TourStatus
  /** Index into `steps` (the playable steps), or -1 when idle. */
  index: number
  steps: readonly TourStep[]
}

/** A step with `waitFor` stays at least this long so the caption can be read. */
export const DEFAULT_MIN_STEP_SEC = 6

/**
 * Plays a tour step by step (P11-T10): start, pause, next, exit. Each step points the
 * camera, optionally nudges the sim, then waits for its duration (or its `waitFor` event).
 * Exit or the end of the tour puts the camera and the sim back as they were.
 */
export class TourRunner<Snapshot = unknown> {
  readonly steps: readonly TourStep[]
  private status: TourStatus = 'idle'
  private index = -1
  private saved: { camera: Snapshot } | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private unsubscribeEvent: (() => void) | null = null
  private stepStartedAt = 0
  private elapsedBeforePause = 0
  private eventSeen = false
  private readonly listeners = new Set<(view: TourView) => void>()
  private readonly now: () => number

  constructor(
    private readonly tour: Tour,
    private readonly ports: TourPorts<Snapshot>,
  ) {
    this.now = ports.now ?? (() => Date.now())
    this.steps = ports.sim ? tour.steps : tour.steps.filter((s) => !s.sim || !s.sim.scenario)
  }

  view(): TourView {
    return { status: this.status, index: this.index, steps: this.steps }
  }

  subscribe(listener: (view: TourView) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.status !== 'idle' || this.steps.length === 0) return
    this.saved = { camera: this.ports.camera.capture() }
    this.ports.sim?.begin(this.tour.seed)
    this.status = 'running'
    this.enter(0)
  }

  pause(): void {
    if (this.status !== 'running') return
    this.elapsedBeforePause += this.now() - this.stepStartedAt
    this.clearTimer()
    this.status = 'paused'
    this.emit()
  }

  resume(): void {
    if (this.status !== 'paused') return
    this.status = 'running'
    this.stepStartedAt = this.now()
    this.schedule()
    this.emit()
  }

  togglePause(): void {
    if (this.status === 'running') this.pause()
    else this.resume()
  }

  /** Skip to the next step; on the last one this ends the tour. Works while paused. */
  next(): void {
    if (this.status === 'idle') return
    if (this.index + 1 >= this.steps.length) {
      this.exit()
      return
    }
    this.status = 'running'
    this.enter(this.index + 1)
  }

  exit(): void {
    if (this.status === 'idle') return
    this.leaveStep()
    this.status = 'idle'
    this.index = -1
    const saved = this.saved
    this.saved = null
    this.ports.sim?.end()
    if (saved) this.ports.camera.restore(saved.camera)
    this.emit()
  }

  private enter(index: number): void {
    this.leaveStep()
    this.index = index
    const step = this.steps[index]!
    this.ports.camera.show(step.camera)
    if (step.sim && this.ports.sim) this.ports.sim.apply(step.sim)
    this.elapsedBeforePause = 0
    this.eventSeen = false
    this.stepStartedAt = this.now()
    if (step.waitFor) {
      this.unsubscribeEvent = this.ports.onEvent(step.waitFor, () => {
        if (this.eventSeen) return
        this.eventSeen = true
        if (this.status === 'running') this.schedule()
      })
    }
    this.schedule()
    this.emit()
  }

  private schedule(): void {
    this.clearTimer()
    const step = this.steps[this.index]
    if (!step) return
    const minMs = (step.minSec ?? DEFAULT_MIN_STEP_SEC) * 1000
    const targetMs = this.eventSeen ? Math.min(minMs, step.durationSec * 1000) : step.durationSec * 1000
    const elapsed = this.elapsedBeforePause + (this.now() - this.stepStartedAt)
    this.timer = setTimeout(() => {
      this.timer = null
      this.next()
    }, Math.max(0, targetMs - elapsed))
  }

  private leaveStep(): void {
    this.clearTimer()
    this.unsubscribeEvent?.()
    this.unsubscribeEvent = null
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private emit(): void {
    const view = this.view()
    for (const listener of this.listeners) listener(view)
  }
}

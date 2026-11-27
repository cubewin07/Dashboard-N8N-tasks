import type { ComponentType } from 'react'

export interface SimControlsDebugApi {
  setSpeed: (speed: 0 | 1 | 30 | 120) => void
  pause: () => void
  setSeed: (seed: string | number) => void
  runScenario: (key: string) => void
  setTeamOnline: (online: boolean) => void
  setAutoApproveBoss: (enabled: boolean) => void
  step: (ticks?: number) => void
  getSnapshot: () => {
    speed: 0 | 1 | 30 | 120
    seed: string
    simNow: string
    teamOnline: boolean
    autoApproveBoss: boolean
    lastScenario: string | null
  }
}

/** What a tour step may ask of the simulator (`docs/plan/phase-11-polish.md` §3.4). */
export interface TourSimStep {
  scenario?: string
  speed?: 0 | 1 | 30 | 120
  autoApproveBoss?: boolean
}

/**
 * The tour's only way into the simulator. Absent on real data: the tour then skips its
 * `sim` steps. `begin` remembers the sim settings and restarts from the tour's seed so the
 * tour is repeatable; `end` puts the remembered settings back.
 */
export interface TourControlsApi {
  begin: (seed: string) => void
  apply: (step: TourSimStep) => void
  end: () => void
}

export const officeExtensions: {
  controlPanel: ComponentType | null
  tourControls: TourControlsApi | null
  simControls: SimControlsDebugApi | null
} = {
  controlPanel: null,
  tourControls: null,
  simControls: null,
}

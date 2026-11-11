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

export const officeExtensions: {
  controlPanel: ComponentType | null
  tourControls: ComponentType | null
  simControls: SimControlsDebugApi | null
} = {
  controlPanel: null,
  tourControls: null,
  simControls: null,
}

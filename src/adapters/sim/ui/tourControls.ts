import type { TourControlsApi, TourSimStep } from '@/office/extensions'
import { simControls, type ScenarioKey, type SimControlsSnapshot } from '../controls'
import { SCENARIO_DESCRIPTORS } from '../scenarios'

const SCENARIO_KEYS = new Set<string>(SCENARIO_DESCRIPTORS.map((d) => d.key))

type Controls = Pick<
  typeof simControls,
  'getSnapshot' | 'setSeed' | 'setSpeed' | 'runScenario' | 'setAutoApproveBoss'
>

/**
 * The guided tour's handle on the simulator (P11-T10). It lives here so the tour never
 * imports the sim: with the sim removed the registry leaves `tourControls` null.
 */
export function createTourControls(controls: Controls = simControls): TourControlsApi {
  let saved: SimControlsSnapshot | null = null
  return {
    begin(seed) {
      saved ??= controls.getSnapshot()
      // A fresh company from a fixed seed: the same tour every time.
      controls.setSeed(seed)
    },
    apply(step: TourSimStep) {
      if (step.speed !== undefined) controls.setSpeed(step.speed)
      if (step.autoApproveBoss !== undefined) controls.setAutoApproveBoss(step.autoApproveBoss)
      if (step.scenario && SCENARIO_KEYS.has(step.scenario)) {
        controls.runScenario(step.scenario as ScenarioKey)
      }
    },
    end() {
      if (!saved) return
      const prev = saved
      saved = null
      // The sim cannot rewind, so the previous company restarts from its own seed.
      controls.setSeed(prev.seed)
      controls.setAutoApproveBoss(prev.autoApproveBoss)
      controls.setSpeed(prev.speed)
    },
  }
}

export const tourControls: TourControlsApi = createTourControls()

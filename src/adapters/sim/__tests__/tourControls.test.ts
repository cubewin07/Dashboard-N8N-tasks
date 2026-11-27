import { describe, expect, it } from 'vitest'
import defaultTour from '@/features/office/tour/defaultTour.json'
import type { SimControlsSnapshot } from '../controls'
import { SCENARIO_DESCRIPTORS } from '../scenarios'
import { createTourControls, TOUR_DIRECTIONS } from '../ui/tourControls'

function stubControls() {
  const calls: string[] = []
  let snap: SimControlsSnapshot = {
    speed: 30,
    seed: 'mine',
    simNow: '2026-11-28T02:00:00.000Z',
    teamOnline: true,
    autoApproveBoss: false,
    lastScenario: null,
  }
  return {
    calls,
    controls: {
      getSnapshot: () => snap,
      setSeed: (s: string | number) => {
        calls.push(`seed ${s}`)
        snap = { ...snap, seed: String(s) }
      },
      setSpeed: (s: 0 | 1 | 30 | 120) => {
        calls.push(`speed ${s}`)
        snap = { ...snap, speed: s }
      },
      runScenario: (k: string) => calls.push(`scenario ${k}`),
      setAutoApproveBoss: (on: boolean) => {
        calls.push(`autoApprove ${on}`)
        snap = { ...snap, autoApproveBoss: on }
      },
    },
  }
}

describe('tourControls', () => {
  it('starts from the tour seed and puts the previous settings back', () => {
    const { calls, controls } = stubControls()
    const tour = createTourControls(controls, {
      noon: { speed: 1, autoApproveBoss: true, scenario: 'lunch' },
      odd: { scenario: 'not_a_scenario' },
    })
    tour.begin('trinh-dien')
    tour.apply('noon')
    tour.apply('odd')
    tour.apply('camera-only')
    tour.end()
    tour.end()
    expect(calls).toEqual([
      'seed trinh-dien',
      'speed 1',
      'autoApprove true',
      'scenario lunch',
      'seed mine',
      'autoApprove false',
      'speed 30',
    ])
  })

  it('directs real tour steps with real scenarios, and every simOnly scene has a scenario', () => {
    const known = new Set(SCENARIO_DESCRIPTORS.map((d) => d.key as string))
    const stepIds = new Set(defaultTour.steps.map((s) => s.id))
    for (const [id, step] of Object.entries(TOUR_DIRECTIONS)) {
      expect(stepIds.has(id), id).toBe(true)
      if (step.scenario) expect(known.has(step.scenario), step.scenario).toBe(true)
    }
    const simOnly = defaultTour.steps.filter((s) => 'simOnly' in s && s.simOnly).map((s) => s.id)
    expect(simOnly.length).toBeGreaterThan(0)
    for (const id of simOnly) expect(TOUR_DIRECTIONS[id]?.scenario, id).toBeTruthy()
  })
})

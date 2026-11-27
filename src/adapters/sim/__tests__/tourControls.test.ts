import { describe, expect, it } from 'vitest'
import defaultTour from '@/features/office/tour/defaultTour.json'
import type { SimControlsSnapshot } from '../controls'
import { SCENARIO_DESCRIPTORS } from '../scenarios'
import { createTourControls } from '../ui/tourControls'

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
    const tour = createTourControls(controls)
    tour.begin('trinh-dien')
    tour.apply({ speed: 1, autoApproveBoss: true, scenario: 'lunch' })
    tour.apply({ scenario: 'not_a_scenario' })
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

  it('every scenario the default tour names exists', () => {
    const known = new Set(SCENARIO_DESCRIPTORS.map((d) => d.key as string))
    const named = defaultTour.steps.flatMap((s) => ('sim' in s && s.sim && 'scenario' in s.sim ? [s.sim.scenario] : []))
    expect(named.length).toBeGreaterThan(0)
    for (const key of named) expect(known.has(key ?? ''), key).toBe(true)
  })
})

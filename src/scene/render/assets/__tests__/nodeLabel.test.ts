import { describe, expect, it } from 'vitest'
import { nodeLabel } from '../modelStore'

describe('nodeLabel', () => {
  it('names the body of a model with an empty label', () => {
    expect(nodeLabel('desk_boss_01_mesh', 'desk_boss_01')).toBe('')
    expect(nodeLabel('desk_boss_01', 'desk_boss_01')).toBe('')
    expect(nodeLabel('mesh', 'desk_boss_01')).toBe('')
  })

  it('strips the model prefix and the mesh suffix from a part', () => {
    expect(nodeLabel('clock_wall_01_hand_hour_mesh', 'clock_wall_01')).toBe('hand_hour')
    expect(nodeLabel('hand_minute_mesh', 'clock_wall_01')).toBe('hand_minute')
    expect(nodeLabel('screen', 'desk_standard_01')).toBe('screen')
  })
})

import { describe, expect, it } from 'vitest'
import { blockoutFor, SLOT_BLOCKOUT } from '../blockoutSpec'
import { decorKind } from '../decorModel'

describe('decorKind (P05-T12)', () => {
  it('tells plants from fixed props by slot id', () => {
    expect(decorKind({ id: 'decor_plant_1', type: 'decor' })).toBe('plant')
    expect(decorKind({ id: 'reception_desk', type: 'decor' })).toBe('counter')
    expect(decorKind({ id: 'intake_desk', type: 'decor' })).toBe('counter')
    expect(decorKind({ id: 'task_wall', type: 'decor' })).toBe('board')
    expect(decorKind({ id: 'something', type: 'decor' })).toBe('plant')
    expect(decorKind({ id: 'desk_1', type: 'desk' })).toBeNull()
  })

  it('draws each decor slot once: plants in Blockout, props in Decor', () => {
    expect(blockoutFor({ id: 'decor_plant_1', type: 'decor' })).toBe(SLOT_BLOCKOUT.decor)
    expect(blockoutFor({ id: 'task_wall', type: 'decor' }).render).toBe(false)
    expect(blockoutFor({ id: 'desk_1', type: 'desk' })).toBe(SLOT_BLOCKOUT.desk)
  })
})

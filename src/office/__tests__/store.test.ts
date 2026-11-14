import { afterEach, describe, expect, it } from 'vitest'
import { makeCommand } from '@/domain/__fixtures__/builders'
import { useConfigStore } from '../configStore'
import { bootOffice, getOfficeState, stopOffice, useOffice } from '../store'

describe('office store and StaticFeed', () => {
  afterEach(() => {
    stopOffice()
  })

  it('boots office state with 28 idle core staff and no tasks', async () => {
    const state = await bootOffice()
    expect(useConfigStore.getState().status).toBe('ready')
    expect(useConfigStore.getState().config?.employees).toHaveLength(28)

    expect(state).toBe(getOfficeState())
    const people = Object.values(state.people)
    expect(people).toHaveLength(28)
    expect(people.every((p) => p.activity === 'idle')).toBe(true)
    expect(Object.keys(state.tasks)).toHaveLength(0)
    expect(useOffice.getState().connection).toBe('live')

    const ack = await useOffice
      .getState()
      .send(makeCommand('intake.submit', { text: 'Test', modality: 'text' }))
    expect(ack).toEqual({
      commandId: 'cmd_01JTEST000000000000000001',
      status: 'rejected',
      reason: 'static_feed',
    })
  })
})

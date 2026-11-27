import { describe, expect, it } from 'vitest'
import { makeCommand, makeSeedConfig } from '@/domain/__fixtures__/builders'
import * as nosim from '@/adapters/_nosim'
import { NullFeed } from '../NullFeed'

describe('NullFeed (P11-T09)', () => {
  it('starts with everyone idle at their desk and never emits', async () => {
    const config = makeSeedConfig()
    const feed = new NullFeed()
    const snap = await feed.start(config)
    const active = config.employees.filter((e) => e.state === 'active')
    expect(Object.keys(snap.state.people)).toHaveLength(active.length)
    expect(Object.values(snap.state.tasks)).toHaveLength(0)
    const off = feed.subscribe()
    expect(typeof off).toBe('function')
    off()
    expect(feed.connection()).toBe('live')
    feed.stop()
  })

  it('refuses every command with no_feed', async () => {
    const feed = new NullFeed()
    const cmd = makeCommand('intake.submit', { text: 'Thử', modality: 'text' })
    await expect(feed.send(cmd)).resolves.toEqual({
      commandId: cmd.id,
      status: 'rejected',
      reason: 'no_feed',
    })
  })

  it('the _nosim stub looks like the sim module, with no panel and no controls', () => {
    expect(nosim.SimFeed).toBe(NullFeed)
    expect(nosim.SimControlPanel).toBeNull()
    expect(nosim.simControls).toBeNull()
  })
})

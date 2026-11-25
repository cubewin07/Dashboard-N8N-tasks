import { describe, expect, it } from 'vitest'
import { RealtimeHub } from '../realtime'

describe('RealtimeHub (browser)', () => {
  it('reacts to browser online/offline events', () => {
    const hub = new RealtimeHub()
    hub.setChannelState('a', 'live')
    window.dispatchEvent(new Event('offline'))
    expect(hub.connection()).toBe('offline')
    window.dispatchEvent(new Event('online'))
    expect(hub.connection()).toBe('live')
  })
})

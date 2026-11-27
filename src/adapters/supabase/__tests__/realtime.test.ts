import { describe, expect, it, vi } from 'vitest'
import { RealtimeHub } from '../realtime'

describe('RealtimeHub', () => {
  it('reports the worst channel state', () => {
    const hub = new RealtimeHub()
    const seen: string[] = []
    hub.onConnection((c) => seen.push(c))
    hub.setChannelState('a', 'live')
    hub.setChannelState('b', 'reconnecting')
    expect(hub.connection()).toBe('reconnecting')
    hub.setChannelState('b', 'offline')
    expect(hub.connection()).toBe('offline')
    hub.setChannelState('b', null)
    expect(hub.connection()).toBe('live')
    expect(seen).toEqual(['live', 'reconnecting', 'offline', 'live'])
  })

  it('reloads on recovery, not on first join', () => {
    const hub = new RealtimeHub()
    const reload = vi.fn()
    const off = hub.registerReload(reload)
    hub.setChannelState('a', 'reconnecting')
    hub.setChannelState('a', 'live')
    expect(reload).not.toHaveBeenCalled()
    hub.setChannelState('a', 'reconnecting')
    hub.setChannelState('a', 'live')
    expect(reload).toHaveBeenCalledTimes(1)
    off()
    hub.setChannelState('a', 'offline')
    hub.setChannelState('a', 'live')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe', () => {
    const hub = new RealtimeHub()
    const cb = vi.fn()
    hub.onConnection(cb)()
    hub.setChannelState('a', 'offline')
    expect(cb).not.toHaveBeenCalled()
  })
})

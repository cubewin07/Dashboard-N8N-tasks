// Shared realtime helper (P09-T10/T13). Each adapter opens its channel through `openChannel`;
// the hub reports the worst channel state ('live' | 'reconnecting' | 'offline') and, when the
// connection comes back after a drop, calls every registered reload() so nothing is missed (R12).
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ConnectionState } from '@/ports/OfficeFeed'
import type { Db } from './client'
import type { RealtimeStatus } from './index'

const RANK: Record<ConnectionState, number> = { live: 0, reconnecting: 1, offline: 2 }

export class RealtimeHub implements RealtimeStatus {
  private readonly states = new Map<string, ConnectionState>()
  private readonly reloaders = new Set<() => void>()
  private readonly listeners = new Set<(c: ConnectionState) => void>()
  private current: ConnectionState = 'reconnecting'
  /** The first 'live' is the initial join, not a recovery: no reload then. */
  private everLive = false
  private browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.browserOnline = true
        this.recompute()
      })
      window.addEventListener('offline', () => {
        this.browserOnline = false
        this.recompute()
      })
    }
  }

  connection(): ConnectionState {
    return this.current
  }

  onConnection(cb: (c: ConnectionState) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /** Called after a reconnect (state went back to 'live' after not being live). */
  registerReload(reload: () => void): () => void {
    this.reloaders.add(reload)
    return () => {
      this.reloaders.delete(reload)
    }
  }

  /** Feed a channel status (exposed for tests and for adapters that manage their own channel). */
  setChannelState(name: string, state: ConnectionState | null): void {
    if (state === null) this.states.delete(name)
    else this.states.set(name, state)
    this.recompute()
  }

  /**
   * Open a channel and track its status. `configure` adds the postgres_changes listeners
   * before subscribe. Returns a close function.
   */
  openChannel(
    db: Db,
    name: string,
    configure: (channel: RealtimeChannel) => RealtimeChannel,
  ): () => void {
    const channel = configure(db.channel(name))
    this.setChannelState(name, 'reconnecting')
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') this.setChannelState(name, 'live')
      else if (status === 'CLOSED') this.setChannelState(name, 'offline')
      else this.setChannelState(name, 'reconnecting') // CHANNEL_ERROR, TIMED_OUT: supabase-js retries
    })
    return () => {
      this.setChannelState(name, null)
      void db.removeChannel(channel)
    }
  }

  private recompute(): void {
    let worst: ConnectionState = 'live'
    if (!this.browserOnline) worst = 'offline'
    for (const s of this.states.values()) if (RANK[s] > RANK[worst]) worst = s
    if (this.states.size === 0 && this.browserOnline) worst = 'live'
    if (worst === this.current) return
    const recovered = worst === 'live' && this.current !== 'live' && this.everLive
    if (worst === 'live') this.everLive = true
    this.current = worst
    for (const cb of this.listeners) cb(worst)
    if (recovered) for (const reload of this.reloaders) reload()
  }
}

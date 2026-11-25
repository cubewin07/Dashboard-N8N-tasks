import { useSyncExternalStore } from 'react'
import type { ConnectionState } from '@/ports/OfficeFeed'

export interface BackendRealtime {
  connection(): ConnectionState
  onConnection(cb: (c: ConnectionState) => void): () => void
}

const RANK: Record<ConnectionState, number> = { live: 0, reconnecting: 1, offline: 2 }

export function worstConnection(a: ConnectionState, b: ConnectionState): ConnectionState {
  return RANK[a] >= RANK[b] ? a : b
}

let source: BackendRealtime | null = null
let unsub: (() => void) | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const l of listeners) l()
}

/** Bootstrap hook: pass the Supabase realtime status (or null for Local adapters). */
export function setBackendRealtime(status: BackendRealtime | null): void {
  unsub?.()
  unsub = null
  source = status
  if (status) unsub = status.onConnection(notify)
  notify()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function snapshot(): ConnectionState {
  return source ? source.connection() : 'live'
}

export function useBackendConnection(): ConnectionState {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

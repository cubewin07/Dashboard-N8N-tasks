import { create } from 'zustand'
import type { Command, CommandAck } from '@/domain/commands'
import { apply } from '@/domain/reducer'
import type { OfficeState } from '@/domain/work'
import type { ConnectionState, OfficeFeed } from '@/ports/OfficeFeed'
import { loadConfig } from './configStore'
import { createFeed } from './feedRegistry'

export interface OfficeStoreValue {
  state: OfficeState | null
  connection: ConnectionState
  send: (cmd: Command) => Promise<CommandAck>
}

let activeFeed: OfficeFeed | null = null
let unsubscribeEvents: (() => void) | null = null
let unsubscribeConn: (() => void) | null = null
let bootPromise: Promise<OfficeState> | null = null

export const useOffice = create<OfficeStoreValue>(() => ({
  state: null,
  connection: 'live',
  async send(cmd: Command): Promise<CommandAck> {
    if (!activeFeed) {
      return {
        commandId: cmd.id,
        status: 'rejected',
        reason: 'not_booted',
      }
    }
    return activeFeed.send(cmd)
  },
}))

export function stopOffice(): void {
  if (unsubscribeEvents) {
    unsubscribeEvents()
    unsubscribeEvents = null
  }
  if (unsubscribeConn) {
    unsubscribeConn()
    unsubscribeConn = null
  }
  if (activeFeed) {
    activeFeed.stop()
    activeFeed = null
  }
  bootPromise = null
}

export async function bootOffice(customFeed?: OfficeFeed): Promise<OfficeState> {
  if (bootPromise && !customFeed) {
    return bootPromise
  }

  const run = async (): Promise<OfficeState> => {
    stopOffice()
    const config = await loadConfig()
    const feed = customFeed ?? createFeed()
    activeFeed = feed

    const snapshot = await feed.start(config)
    useOffice.setState({
      state: snapshot.state,
      connection: feed.connection(),
    })

    unsubscribeEvents = feed.subscribe((batch) => {
      const current = useOffice.getState().state
      if (!current) return
      let next = current
      for (const evt of batch) {
        next = apply(next, evt)
      }
      if (next !== current) {
        useOffice.setState({ state: next })
      }
    })

    unsubscribeConn = feed.onConnection((c) => {
      useOffice.setState({ connection: c })
    })

    return snapshot.state
  }

  bootPromise = run()
  return bootPromise
}

export function getOfficeState(): OfficeState | null {
  return useOffice.getState().state
}

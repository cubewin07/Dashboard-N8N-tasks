import { create } from 'zustand'
import type { Command, CommandAck } from '@/domain/commands'
import type { OfficeEvent } from '@/domain/events'
import { applyAll } from '@/domain/reducer'
import type { OfficeState } from '@/domain/work'
import type { ConnectionState, OfficeFeed } from '@/ports/OfficeFeed'
import { loadConfig } from './configStore'
import { officeExtensions } from './extensions'
import { createFeed } from './feedRegistry'

export type OfficeCommandState =
  | 'idle'
  | 'sending'
  | 'queued'
  | 'applied'
  | 'failed'

export interface OfficeCommandRecord {
  id: string
  status: Exclude<OfficeCommandState, 'idle'>
  reason: string | null
}

export interface OfficeStoreValue {
  state: OfficeState | null
  connection: ConnectionState
  commands: Record<string, OfficeCommandRecord>
  legacyActive: boolean
  send: (cmd: Command) => Promise<CommandAck>
}

let activeFeed: OfficeFeed | null = null
let unsubscribeEvents: (() => void) | null = null
let unsubscribeConn: (() => void) | null = null
let unsubscribeReset: (() => void) | null = null
let bootPromise: Promise<OfficeState> | null = null

let pendingEvents: OfficeEvent[] = []
let rafHandle: number | ReturnType<typeof setTimeout> | null = null
let rafUsesAnimationFrame = false

function cancelScheduledFlush(): void {
  if (rafHandle === null) return
  if (
    rafUsesAnimationFrame &&
    typeof cancelAnimationFrame === 'function' &&
    typeof rafHandle === 'number'
  ) {
    cancelAnimationFrame(rafHandle)
  } else {
    clearTimeout(rafHandle as ReturnType<typeof setTimeout>)
  }
  rafHandle = null
}

export function flushOfficeEvents(): void {
  cancelScheduledFlush()
  if (pendingEvents.length === 0) return

  const drained = pendingEvents.splice(0, pendingEvents.length)
  const store = useOffice.getState()
  const current = store.state
  if (!current) return

  const nextState = applyAll(current, drained)
  let nextCommands = store.commands
  let commandsChanged = false

  for (const evt of drained) {
    if (evt.causedBy) {
      if (!commandsChanged) {
        nextCommands = { ...store.commands }
        commandsChanged = true
      }
      nextCommands[evt.causedBy] = {
        id: evt.causedBy,
        status: 'applied',
        reason: null,
      }
    }
  }

  if (nextState !== current || commandsChanged) {
    useOffice.setState({
      state: nextState,
      commands: nextCommands,
    })
  }
}

function scheduleFlush(): void {
  if (rafHandle !== null) return
  if (typeof requestAnimationFrame === 'function') {
    rafUsesAnimationFrame = true
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null
      flushOfficeEvents()
    })
  } else {
    rafUsesAnimationFrame = false
    rafHandle = setTimeout(() => {
      rafHandle = null
      flushOfficeEvents()
    }, 16)
  }
}

function syncDebugWindow(): void {
  if (typeof window === 'undefined') return
  const enabled =
    Boolean(import.meta.env.DEV) ||
    Boolean(import.meta.env.VITE_E2E) ||
    Boolean(import.meta.env.VITE_DEBUG)
  if (!enabled) return

  const win = window as unknown as {
    __office_debug?: Record<string, unknown>
  }
  win.__office_debug = {
    ...(win.__office_debug ?? {}),
    getState: () => {
      flushOfficeEvents()
      return useOffice.getState().state
    },
    sim: officeExtensions.simControls ?? undefined,
  }
}

export async function sendCommand(cmd: Command): Promise<CommandAck> {
  if (!activeFeed) {
    useOffice.setState((prev) => ({
      commands: {
        ...prev.commands,
        [cmd.id]: {
          id: cmd.id,
          status: 'failed',
          reason: 'not_booted',
        },
      },
    }))
    return {
      commandId: cmd.id,
      status: 'rejected',
      reason: 'not_booted',
    }
  }

  useOffice.setState((prev) => ({
    commands: {
      ...prev.commands,
      [cmd.id]: {
        id: cmd.id,
        status: 'sending',
        reason: null,
      },
    },
  }))

  const ack = await activeFeed.send(cmd)

  useOffice.setState((prev) => {
    const existing = prev.commands[cmd.id]
    if (ack.status === 'rejected') {
      return {
        commands: {
          ...prev.commands,
          [cmd.id]: {
            id: cmd.id,
            status: 'failed',
            reason: ack.reason ?? null,
          },
        },
      }
    }
    // Preserve 'applied' if the causedBy event was already flushed
    if (existing?.status === 'applied') {
      return prev
    }
    return {
      commands: {
        ...prev.commands,
        [cmd.id]: {
          id: cmd.id,
          status: 'queued',
          reason: null,
        },
      },
    }
  })

  return ack
}

export const useOffice = create<OfficeStoreValue>(() => ({
  state: null,
  connection: 'live',
  commands: {},
  legacyActive: false,
  send: sendCommand,
}))

export function setLegacyRouteActive(active: boolean): void {
  if (useOffice.getState().legacyActive !== active) {
    useOffice.setState({ legacyActive: active })
  }
}

export function stopOffice(): void {
  cancelScheduledFlush()
  pendingEvents = []

  if (unsubscribeEvents) {
    unsubscribeEvents()
    unsubscribeEvents = null
  }
  if (unsubscribeConn) {
    unsubscribeConn()
    unsubscribeConn = null
  }
  if (unsubscribeReset) {
    unsubscribeReset()
    unsubscribeReset = null
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
      commands: {},
    })

    syncDebugWindow()

    if (feed.onReset) {
      unsubscribeReset = feed.onReset((resetState) => {
        cancelScheduledFlush()
        pendingEvents = []
        useOffice.setState({
          state: resetState,
          commands: {},
        })
      })
    }

    unsubscribeEvents = feed.subscribe((batch) => {
      if (batch.length === 0) return
      pendingEvents.push(...batch)
      scheduleFlush()
    })

    unsubscribeConn = feed.onConnection((c) => {
      useOffice.setState({ connection: c })
    })

    return snapshot.state
  }

  bootPromise = run()
  // A failed boot (e.g. an unreadable replay log) must not be cached forever.
  bootPromise.catch(() => {
    bootPromise = null
  })
  return bootPromise
}

export function getOfficeState(): OfficeState | null {
  flushOfficeEvents()
  return useOffice.getState().state
}

export interface FeedClock {
  /** Feed time now (sim time for the simulator, wall time for the real system). */
  nowMs: number
  /**
   * Feed seconds per real second when the feed can say so (0 = paused);
   * null when it has to be measured from `nowMs`.
   */
  rate: number | null
}

/** The feed clock, for the scene's movement speed. Null before boot. */
export function getFeedClock(): FeedClock | null {
  if (!activeFeed) return null
  const controls = activeFeed.kind === 'sim' ? officeExtensions.simControls : null
  return {
    nowMs: Date.parse(activeFeed.now()),
    rate: controls ? controls.getSnapshot().speed : null,
  }
}

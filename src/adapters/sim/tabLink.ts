import type { Command, CommandAck } from '@/domain/commands'
import type { ConfigChange, OrgConfig } from '@/domain/config'
import type { OfficeEvent } from '@/domain/events'
import type { Iso } from '@/domain/primitives'
import type { OfficeState } from '@/domain/work'
import type { ConnectionState, OfficeFeed, OfficeSnapshot } from '@/ports/OfficeFeed'
import { DEFAULT_SIM_START_ISO } from './clock'
import {
  simControls,
  type ScenarioKey,
  type SimControllerDriver,
  type SimControlsSnapshot,
  type SimSpeed,
} from './controls'
import { SimFeed, type SimFeedOptions } from './SimFeed'

/**
 * P11-T04: one simulated company per browser profile. Two tabs (say, a phone-sized window and
 * the desktop office) used to run two unrelated simulations, so approving in one changed
 * nothing in the other. Now the tab holding a Web Lock runs the real `SimFeed` (the leader);
 * every other tab follows it over a `BroadcastChannel`: it gets the leader's snapshot and
 * event batches and forwards commands, sim controls and config edits. When the leader tab
 * closes, a follower takes the lock and restarts the simulation from the company as it was.
 * Without `BroadcastChannel` or `navigator.locks` the feed is a plain `SimFeed`.
 */

export const TAB_LINK_CHANNEL = 'ai-office.sim.v1'
export const TAB_LINK_LOCK = 'ai-office.sim.leader.v1'
const HELLO_TIMEOUT_MS = 1500
const COMMAND_TIMEOUT_MS = 8000

type ControlOp =
  | { op: 'setSpeed'; speed: SimSpeed }
  | { op: 'setSeed'; seed: string }
  | { op: 'runScenario'; key: ScenarioKey }
  | { op: 'setTeamOnline'; online: boolean }
  | { op: 'setAutoApproveBoss'; enabled: boolean }
  | { op: 'step'; ticks: number }

export type TabLinkMessage =
  | { t: 'hello'; from: string }
  | { t: 'bye'; from: string }
  | { t: 'leader'; from: string }
  | {
      t: 'snapshot'
      to: string
      snapshot: OfficeSnapshot
      now: Iso
      connection: ConnectionState
      controls: SimControlsSnapshot
    }
  | { t: 'events'; batch: OfficeEvent[]; now: Iso }
  | { t: 'reset'; state: OfficeState; now: Iso }
  | { t: 'connection'; connection: ConnectionState }
  | { t: 'controls'; controls: SimControlsSnapshot }
  | { t: 'cmd'; from: string; cmd: Command }
  | { t: 'ack'; to: string; ack: CommandAck }
  | { t: 'control'; control: ControlOp }
  | { t: 'reconfigure'; config: OrgConfig; change: ConfigChange | null }

export interface TabLinkChannel {
  postMessage(msg: TabLinkMessage): void
  onmessage: ((ev: { data: TabLinkMessage }) => void) | null
  close(): void
}

export interface TabLinkLocks {
  /**
   * Resolves `true` once this tab holds the leader lock (kept until `release`), `false` when
   * `ifAvailable` and someone else holds it, or when the request was aborted.
   */
  acquire(opts: { ifAvailable: boolean; signal?: AbortSignal; onHeld: (release: () => void) => void }): Promise<boolean>
}

export interface LinkedSimFeedDeps {
  channel?: () => TabLinkChannel | null
  locks?: TabLinkLocks | null
  createInner?: (options: SimFeedOptions) => SimFeed
  /** Global sim controls (the panel and `__office_debug`); tests pass a stub. */
  controls?: Pick<typeof simControls, 'bindDriver' | 'syncSnapshot' | 'subscribe' | 'getSnapshot'>
  id?: string
}

function browserChannel(): TabLinkChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  try {
    return new BroadcastChannel(TAB_LINK_CHANNEL) as unknown as TabLinkChannel
  } catch {
    return null
  }
}

function browserLocks(): TabLinkLocks | null {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks || typeof locks.request !== 'function') return null
  return {
    acquire({ ifAvailable, signal, onHeld }) {
      return new Promise<boolean>((resolve) => {
        const options: LockOptions = ifAvailable ? { ifAvailable: true } : { signal }
        locks
          .request(TAB_LINK_LOCK, options, (lock) => {
            if (!lock) {
              resolve(false)
              return undefined
            }
            resolve(true)
            return new Promise<void>((release) => onHeld(release))
          })
          .catch(() => resolve(false))
      })
    },
  }
}

function randomId(): string {
  return `tab_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

export class LinkedSimFeed implements OfficeFeed {
  public readonly kind = 'sim' as const
  private readonly options: SimFeedOptions
  private readonly deps: Required<Omit<LinkedSimFeedDeps, 'locks' | 'channel'>> & {
    locks: TabLinkLocks | null
    channel: () => TabLinkChannel | null
  }

  private role: 'idle' | 'leader' | 'follower' = 'idle'
  private inner: SimFeed | null = null
  private innerUnsubs: (() => void)[] = []
  private channel: TabLinkChannel | null = null
  private releaseLock: (() => void) | null = null
  private waitAbort: AbortController | null = null
  private stopped = false

  private config: OrgConfig | null = null
  private followers = new Set<string>()
  private pendingHello: ((msg: Extract<TabLinkMessage, { t: 'snapshot' }>) => void) | null = null
  private pendingAcks = new Map<string, (ack: CommandAck) => void>()

  private followerNow: Iso = DEFAULT_SIM_START_ISO
  private followerConnection: ConnectionState = 'live'
  private followerControls: SimControlsSnapshot | null = null
  private lastState: OfficeState | null = null
  /** Batches a follower received between its snapshot and the store's subscribe. */
  private bufferedEvents: OfficeEvent[] = []
  private innerEventsAttached = false

  private eventListeners = new Set<(batch: OfficeEvent[]) => void>()
  private connectionListeners = new Set<(c: ConnectionState) => void>()
  private resetListeners = new Set<(state: OfficeState) => void>()

  constructor(options: SimFeedOptions = {}, deps: LinkedSimFeedDeps = {}) {
    this.options = options
    this.deps = {
      channel: deps.channel ?? browserChannel,
      locks: deps.locks === undefined ? browserLocks() : deps.locks,
      createInner: deps.createInner ?? ((o) => new SimFeed(o)),
      controls: deps.controls ?? simControls,
      id: deps.id ?? randomId(),
    }
  }

  /** 'leader' | 'follower' once started (tests and diagnostics). */
  get linkRole(): 'idle' | 'leader' | 'follower' {
    return this.role
  }

  async start(config: OrgConfig): Promise<OfficeSnapshot> {
    this.config = config
    const locks = this.deps.locks
    this.channel = locks ? this.deps.channel() : null
    if (!locks || !this.channel) {
      this.channel?.close()
      this.channel = null
      return this.lead(config, false)
    }
    this.channel.onmessage = (ev) => this.onMessage(ev.data)

    const held = await locks.acquire({
      ifAvailable: true,
      onHeld: (release) => {
        this.releaseLock = release
      },
    })
    if (this.stopped) {
      this.releaseLock?.()
      this.releaseLock = null
      return this.lead(config, false)
    }
    if (held) return this.lead(config, true)

    const snap = await this.askLeader()
    if (!snap) {
      // A leader holds the lock but does not answer (a frozen tab): run alone, unlinked.
      this.channel.close()
      this.channel = null
      return this.lead(config, false)
    }
    this.role = 'follower'
    this.adoptLeaderSnapshot(snap)
    this.waitForLeadership()
    return snap.snapshot
  }

  subscribe(onEvents: (batch: OfficeEvent[]) => void): () => void {
    this.eventListeners.add(onEvents)
    if (this.role === 'leader') this.attachInnerEvents()
    if (this.bufferedEvents.length > 0) {
      const buffered = this.bufferedEvents
      this.bufferedEvents = []
      onEvents(buffered)
    }
    return () => {
      this.eventListeners.delete(onEvents)
    }
  }

  async send(cmd: Command): Promise<CommandAck> {
    if (this.role === 'leader' && this.inner) return this.inner.send(cmd)
    if (this.role !== 'follower' || !this.channel) {
      return { commandId: cmd.id, status: 'rejected', reason: 'invalid_state' }
    }
    const channel = this.channel
    return new Promise<CommandAck>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(cmd.id)
        resolve({ commandId: cmd.id, status: 'rejected', reason: 'timeout' })
      }, COMMAND_TIMEOUT_MS)
      this.pendingAcks.set(cmd.id, (ack) => {
        clearTimeout(timer)
        resolve(ack)
      })
      channel.postMessage({ t: 'cmd', from: this.deps.id, cmd })
    })
  }

  now(): Iso {
    return this.role === 'leader' && this.inner ? this.inner.now() : this.followerNow
  }

  connection(): ConnectionState {
    return this.role === 'leader' && this.inner ? this.inner.connection() : this.followerConnection
  }

  onConnection(cb: (c: ConnectionState) => void): () => void {
    this.connectionListeners.add(cb)
    return () => {
      this.connectionListeners.delete(cb)
    }
  }

  onReset(cb: (state: OfficeState) => void): () => void {
    this.resetListeners.add(cb)
    return () => {
      this.resetListeners.delete(cb)
    }
  }

  reconfigure(config: OrgConfig, change: ConfigChange | null): void {
    this.config = config
    if (this.role === 'leader') this.inner?.reconfigure(config, change)
    else if (this.role === 'follower') this.channel?.postMessage({ t: 'reconfigure', config, change })
  }

  stop(): void {
    this.stopped = true
    if (this.role === 'follower') {
      this.channel?.postMessage({ t: 'bye', from: this.deps.id })
      this.deps.controls.bindDriver(null)
    }
    this.waitAbort?.abort()
    this.waitAbort = null
    this.innerUnsubs.forEach((u) => u())
    this.innerUnsubs = []
    this.inner?.stop()
    this.inner = null
    this.releaseLock?.()
    this.releaseLock = null
    this.channel?.close()
    this.channel = null
    for (const [commandId, resolve] of this.pendingAcks) {
      resolve({ commandId: commandId as Command['id'], status: 'rejected', reason: 'invalid_state' })
    }
    this.pendingAcks.clear()
    this.role = 'idle'
  }

  // ---- leader ----

  private async lead(config: OrgConfig, linked: boolean): Promise<OfficeSnapshot> {
    this.role = 'leader'
    const inner = this.deps.createInner(this.options)
    this.inner = inner
    this.innerEventsAttached = false
    const snapshot = await inner.start(config)
    this.innerUnsubs.push(
      inner.onConnection((c) => {
        this.connectionListeners.forEach((l) => l(c))
        this.broadcast({ t: 'connection', connection: c })
      }),
      inner.onReset((state) => {
        this.resetListeners.forEach((l) => l(state))
        this.broadcast({ t: 'reset', state, now: inner.now() })
      }),
    )
    if (linked) {
      this.innerUnsubs.push(
        this.deps.controls.subscribe(() => {
          this.broadcast({ t: 'controls', controls: inner.getSnapshot() })
        }),
      )
      // Followers that were following a tab that just closed re-introduce themselves.
      this.channel?.postMessage({ t: 'leader', from: this.deps.id })
    }
    return snapshot
  }

  /**
   * Attached on the store's subscribe, as with a plain SimFeed: the sim emits its first tick
   * when its first listener arrives, and those events must reach the store.
   */
  private attachInnerEvents(): void {
    const inner = this.inner
    if (!inner || this.innerEventsAttached) return
    this.innerEventsAttached = true
    this.innerUnsubs.push(
      inner.subscribe((batch) => {
        this.lastState = inner.getState()
        this.eventListeners.forEach((l) => l(batch))
        this.broadcast({ t: 'events', batch, now: inner.now() })
      }),
    )
  }

  /** Followers exist only when someone said hello; a lone tab posts nothing. */
  private broadcast(msg: TabLinkMessage): void {
    if (this.role === 'leader' && this.followers.size > 0) this.channel?.postMessage(msg)
  }

  private snapshotFor(to: string): TabLinkMessage | null {
    const inner = this.inner
    if (!inner) return null
    let state: OfficeState
    try {
      state = inner.getState()
    } catch {
      return null
    }
    return {
      t: 'snapshot',
      to,
      snapshot: { state, seq: state.seq },
      now: inner.now(),
      connection: inner.connection(),
      controls: inner.getSnapshot(),
    }
  }

  private runControl(control: ControlOp): void {
    const inner = this.inner
    if (!inner) return
    switch (control.op) {
      case 'setSpeed':
        inner.setSpeed(control.speed)
        break
      case 'setSeed':
        inner.setSeed(control.seed)
        break
      case 'runScenario':
        inner.runScenario(control.key)
        break
      case 'setTeamOnline':
        inner.setTeamOnline(control.online)
        break
      case 'setAutoApproveBoss':
        inner.setAutoApproveBoss(control.enabled)
        break
      case 'step':
        inner.step(control.ticks)
        break
    }
  }

  // ---- follower ----

  private askLeader(): Promise<Extract<TabLinkMessage, { t: 'snapshot' }> | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingHello = null
        resolve(null)
      }, HELLO_TIMEOUT_MS)
      this.pendingHello = (msg) => {
        clearTimeout(timer)
        this.pendingHello = null
        resolve(msg)
      }
      this.channel?.postMessage({ t: 'hello', from: this.deps.id })
    })
  }

  private adoptLeaderSnapshot(msg: Extract<TabLinkMessage, { t: 'snapshot' }>): void {
    this.followerNow = msg.now
    this.lastState = msg.snapshot.state
    this.setFollowerConnection(msg.connection)
    this.followerControls = msg.controls
    this.deps.controls.bindDriver(this.forwardingDriver())
  }

  private forwardingDriver(): SimControllerDriver {
    const post = (control: ControlOp) => this.channel?.postMessage({ t: 'control', control })
    return {
      setSpeed: (speed) => post({ op: 'setSpeed', speed }),
      setSeed: (seed) => post({ op: 'setSeed', seed: String(seed) }),
      runScenario: (key) => post({ op: 'runScenario', key }),
      setTeamOnline: (online) => post({ op: 'setTeamOnline', online }),
      setAutoApproveBoss: (enabled) => post({ op: 'setAutoApproveBoss', enabled }),
      step: (ticks = 1) => post({ op: 'step', ticks }),
      getSnapshot: () => this.followerControls ?? this.deps.controls.getSnapshot(),
    }
  }

  private setFollowerConnection(c: ConnectionState): void {
    if (c === this.followerConnection) return
    this.followerConnection = c
    this.connectionListeners.forEach((l) => l(c))
  }

  /** Queue for the lock; when the leader tab goes away this tab carries the company on. */
  private waitForLeadership(): void {
    const locks = this.deps.locks
    if (!locks) return
    const abort = new AbortController()
    this.waitAbort = abort
    void locks
      .acquire({
        ifAvailable: false,
        signal: abort.signal,
        onHeld: (release) => {
          this.releaseLock = release
        },
      })
      .then(async (held) => {
        if (!held || this.stopped) {
          if (held) this.releaseLock?.()
          return
        }
        this.waitAbort = null
        this.deps.controls.bindDriver(null)
        const config = this.lastState?.config ?? this.config
        if (!config) return
        const controls = this.followerControls
        if (controls) {
          this.options.seed = controls.seed
          this.options.speed = controls.speed
        }
        this.followers.clear()
        const snap = await this.lead(config, true)
        this.followerNow = this.now()
        this.resetListeners.forEach((l) => l(snap.state))
        this.setFollowerConnection(this.connection())
        if (this.eventListeners.size > 0) this.attachInnerEvents()
      })
  }

  // ---- messages ----

  private onMessage(msg: TabLinkMessage): void {
    if (this.stopped) return
    if (this.role === 'leader') {
      switch (msg.t) {
        case 'hello': {
          this.followers.add(msg.from)
          const snap = this.snapshotFor(msg.from)
          if (snap) this.channel?.postMessage(snap)
          return
        }
        case 'bye':
          this.followers.delete(msg.from)
          return
        case 'cmd':
          void this.inner?.send(msg.cmd).then((ack) => {
            this.channel?.postMessage({ t: 'ack', to: msg.from, ack })
          })
          return
        case 'control':
          this.runControl(msg.control)
          return
        case 'reconfigure':
          this.config = msg.config
          this.inner?.reconfigure(msg.config, msg.change)
          return
        default:
          return
      }
    }

    // follower (or still deciding)
    switch (msg.t) {
      case 'snapshot':
        if (msg.to !== this.deps.id) return
        if (this.pendingHello) {
          this.pendingHello(msg)
        } else if (this.role === 'follower') {
          // A new leader after the old tab closed: replace, do not append.
          this.adoptLeaderSnapshot(msg)
          this.resetListeners.forEach((l) => l(msg.snapshot.state))
        }
        return
      case 'leader':
        if (this.role === 'follower') this.channel?.postMessage({ t: 'hello', from: this.deps.id })
        return
      case 'events':
        if (this.role !== 'follower') return
        this.followerNow = msg.now
        if (this.eventListeners.size === 0) this.bufferedEvents.push(...msg.batch)
        else this.eventListeners.forEach((l) => l(msg.batch))
        return
      case 'reset':
        if (this.role !== 'follower') return
        this.followerNow = msg.now
        this.lastState = msg.state
        this.bufferedEvents = []
        this.resetListeners.forEach((l) => l(msg.state))
        return
      case 'connection':
        if (this.role === 'follower') this.setFollowerConnection(msg.connection)
        return
      case 'controls':
        if (this.role !== 'follower') return
        this.followerControls = msg.controls
        this.followerNow = msg.controls.simNow
        this.deps.controls.syncSnapshot(msg.controls)
        return
      case 'ack': {
        if (msg.to !== this.deps.id) return
        const resolve = this.pendingAcks.get(msg.ack.commandId)
        if (resolve) {
          this.pendingAcks.delete(msg.ack.commandId)
          resolve(msg.ack)
        }
        return
      }
      default:
        return
    }
  }
}

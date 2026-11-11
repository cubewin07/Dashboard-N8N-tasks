import type { Command, CommandAck } from '@/domain/commands'
import type { OrgConfig } from '@/domain/config'
import type { OfficeEvent } from '@/domain/events'
import type { Iso } from '@/domain/primitives'
import type { OfficeState } from '@/domain/work'
import type {
  ConnectionState,
  OfficeFeed,
  OfficeSnapshot,
} from '@/ports/OfficeFeed'
import {
  flushOfflineCommands,
  handleSimCommand,
} from './brain/commands'
import { emitSimEvent, type SimBrainContext } from './brain/context'
import {
  createBrainContext,
  flushBrainPendingEvents,
  REAL_TICK_MS,
  SIM_QUANTUM_MS,
  stepBrainQuantum,
} from './brain/tick'
import { DEFAULT_SIM_START_ISO, type SimSpeed } from './clock'
import {
  DEFAULT_SIM_SEED,
  simControls,
  type ScenarioKey,
  type SimControllerDriver,
  type SimControlsSnapshot,
} from './controls'
import { executeScenario } from './scenarios'

export interface SimFeedOptions {
  seed?: string | number
  speed?: SimSpeed
  autoStartTimer?: boolean
  bindGlobalControls?: boolean
}

export class SimFeed implements OfficeFeed, SimControllerDriver {
  public readonly kind = 'sim' as const
  private seed: string
  private speed: SimSpeed
  private readonly autoStartTimer: boolean
  private readonly bindGlobalControls: boolean

  private config: OrgConfig | null = null
  private ctx: SimBrainContext | null = null
  private simAccumMs = 0
  private lastScenario: ScenarioKey | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null

  private eventListeners = new Set<(batch: OfficeEvent[]) => void>()
  private connectionListeners = new Set<(c: ConnectionState) => void>()
  private resetListeners = new Set<(state: OfficeState) => void>()

  constructor(options: SimFeedOptions = {}) {
    const controlSnap = simControls.getSnapshot()
    this.seed =
      options.seed !== undefined
        ? String(options.seed)
        : controlSnap.seed || DEFAULT_SIM_SEED
    this.speed =
      options.speed !== undefined ? options.speed : controlSnap.speed
    this.autoStartTimer = options.autoStartTimer ?? true
    this.bindGlobalControls = options.bindGlobalControls ?? true
  }

  async start(config: OrgConfig): Promise<OfficeSnapshot> {
    this.stopTimer()
    this.config = config
    this.simAccumMs = 0
    this.ctx = createBrainContext(config, this.seed, this.speed)

    if (this.bindGlobalControls) {
      simControls.bindDriver(this)
    }

    if (this.autoStartTimer) {
      this.startTimer()
    }

    return {
      state: this.ctx.state,
      seq: this.ctx.seq,
    }
  }

  subscribe(onEvents: (batch: OfficeEvent[]) => void): () => void {
    this.eventListeners.add(onEvents)
    // In interactive browser mode, emit the initial tick right after the first subscriber attaches
    if (
      this.autoStartTimer &&
      this.ctx &&
      this.ctx.seq === 0 &&
      this.speed > 0
    ) {
      this.step(1)
    }
    return () => {
      this.eventListeners.delete(onEvents)
    }
  }

  async send(cmd: Command): Promise<CommandAck> {
    if (!this.ctx) {
      return {
        commandId: cmd.id,
        status: 'rejected',
        reason: 'invalid_state',
      }
    }
    const ack = handleSimCommand(this.ctx, cmd)
    this.flushAndNotify()
    return ack
  }

  now(): Iso {
    return this.ctx ? this.ctx.clock.now() : DEFAULT_SIM_START_ISO
  }

  connection(): ConnectionState {
    if (!this.ctx) return 'live'
    return this.ctx.teamOnline ? 'live' : 'offline'
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

  stop(): void {
    this.stopTimer()
    if (this.bindGlobalControls) {
      simControls.bindDriver(null)
    }
  }

  getState(): OfficeState {
    if (!this.ctx) {
      throw new Error('SimFeed has not been started')
    }
    return this.ctx.state
  }

  step(ticks = 1): OfficeEvent[] {
    if (!this.ctx || ticks <= 0 || this.speed === 0) {
      return []
    }
    const allEmitted: OfficeEvent[] = []
    for (let i = 0; i < ticks; i += 1) {
      this.simAccumMs += REAL_TICK_MS * this.speed
      while (this.simAccumMs >= SIM_QUANTUM_MS) {
        this.simAccumMs -= SIM_QUANTUM_MS
        stepBrainQuantum(this.ctx)
      }
      const batch = this.flushAndNotify()
      if (batch.length > 0) {
        allEmitted.push(...batch)
      }
    }
    this.syncControls()
    return allEmitted
  }

  stepSimMs(simDurationMs: number): OfficeEvent[] {
    if (!this.ctx || simDurationMs <= 0) {
      return []
    }
    const allEmitted: OfficeEvent[] = []
    this.simAccumMs += simDurationMs
    while (this.simAccumMs >= SIM_QUANTUM_MS) {
      this.simAccumMs -= SIM_QUANTUM_MS
      stepBrainQuantum(this.ctx)
      const batch = this.flushAndNotify()
      if (batch.length > 0) {
        allEmitted.push(...batch)
      }
    }
    this.syncControls()
    return allEmitted
  }

  setSpeed(speed: SimSpeed): void {
    this.speed = speed
    if (this.ctx) {
      this.ctx.clock.setSpeed(speed)
    }
    this.syncControls()
  }

  setSeed(seed: string | number): void {
    this.seed = String(seed).trim() || DEFAULT_SIM_SEED
    if (this.config) {
      this.simAccumMs = 0
      this.ctx = createBrainContext(this.config, this.seed, this.speed)
      for (const cb of this.resetListeners) {
        cb(this.ctx.state)
      }
      if (this.autoStartTimer && this.speed > 0) {
        this.step(1)
      }
    }
    this.syncControls()
  }

  runScenario(key: ScenarioKey): OfficeEvent[] {
    if (!this.ctx) return []
    const prevOnline = this.ctx.teamOnline
    this.lastScenario = key
    executeScenario(this.ctx, key)
    const batch = this.flushAndNotify()
    if (this.ctx.teamOnline !== prevOnline) {
      this.notifyConnection()
    }
    this.syncControls()
    return batch
  }

  setTeamOnline(online: boolean): void {
    if (!this.ctx) return
    const prev = this.ctx.teamOnline
    this.ctx.teamOnline = online
    if (online && !prev) {
      flushOfflineCommands(this.ctx)
      this.ctx.lastHeartbeatSimMs = this.ctx.clock.nowMs()
      emitSimEvent(this.ctx, 'system.heartbeat', {
        source: 'sim',
        version: '1.0.0',
      })
      this.flushAndNotify()
    }
    if (online !== prev) {
      this.notifyConnection()
    }
    this.syncControls()
  }

  setAutoApproveBoss(enabled: boolean): void {
    if (!this.ctx) return
    this.ctx.autoApproveBoss = enabled
    this.syncControls()
  }

  getSnapshot(): SimControlsSnapshot {
    return {
      speed: this.speed,
      seed: this.seed,
      simNow: this.ctx ? this.ctx.clock.now() : DEFAULT_SIM_START_ISO,
      teamOnline: this.ctx ? this.ctx.teamOnline : true,
      autoApproveBoss: this.ctx ? this.ctx.autoApproveBoss : false,
      lastScenario: this.lastScenario,
    }
  }

  private startTimer(): void {
    this.stopTimer()
    this.intervalId = setInterval(() => {
      if (this.speed > 0) {
        this.step(1)
      }
    }, REAL_TICK_MS)
  }

  private stopTimer(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private flushAndNotify(): OfficeEvent[] {
    if (!this.ctx) return []
    const batch = flushBrainPendingEvents(this.ctx)
    if (batch.length > 0) {
      for (const listener of this.eventListeners) {
        listener(batch)
      }
    }
    return batch
  }

  private notifyConnection(): void {
    const conn = this.connection()
    for (const cb of this.connectionListeners) {
      cb(conn)
    }
  }

  private syncControls(): void {
    if (this.bindGlobalControls) {
      simControls.syncSnapshot(this.getSnapshot())
    }
  }
}

export function createSimFeed(options?: SimFeedOptions): SimFeed {
  return new SimFeed(options)
}

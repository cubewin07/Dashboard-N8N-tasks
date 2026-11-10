import type { Command, CommandAck } from '@/domain/commands'
import type { OrgConfig } from '@/domain/config'
import { parseEvent, type OfficeEvent } from '@/domain/events'
import type { Iso } from '@/domain/primitives'
import { applyAll, initialState } from '@/domain/reducer'
import type { OfficeState } from '@/domain/work'
import type {
  ConnectionState,
  OfficeFeed,
  OfficeSnapshot,
} from '@/ports/officeFeed'

const DEFAULT_START_ISO: Iso = '2026-11-02T01:00:00.000Z'

export interface ReplayLogBundle {
  seed: string | number
  simDurationMs: number
  startIso: Iso
  endIso: Iso
  stateHash: string
  events: OfficeEvent[]
}

export function hashOfficeState(state: OfficeState): string {
  const canonical = JSON.stringify({
    seq: state.seq,
    now: state.now,
    lastHeartbeat: state.lastHeartbeat ?? null,
    people: Object.keys(state.people)
      .sort()
      .map((id) => state.people[id as keyof typeof state.people]),
    tasks: Object.keys(state.tasks)
      .sort()
      .map((id) => state.tasks[id as keyof typeof state.tasks]),
    reviews: Object.keys(state.reviews)
      .sort()
      .map((id) => state.reviews[id as keyof typeof state.reviews]),
    questions: Object.keys(state.questions)
      .sort()
      .map((id) => state.questions[id as keyof typeof state.questions]),
    help: Object.keys(state.help)
      .sort()
      .map((id) => state.help[id as keyof typeof state.help]),
    logIds: state.log.map((e) => e.id),
  })

  let h1 = 0x811c9dc5 >>> 0
  let h2 = 0x01000193 >>> 0
  for (let i = 0; i < canonical.length; i += 1) {
    const ch = canonical.charCodeAt(i)
    h1 ^= ch
    h1 = Math.imul(h1, 16777619) >>> 0
    h2 ^= ch
    h2 = Math.imul(h2, 2246822519) >>> 0
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}_${state.seq}`
}

export interface ReplayFeedOptions {
  events?: readonly OfficeEvent[]
  startIso?: Iso
  logUrl?: string
  speed?: number
  autoStartTimer?: boolean
}

export class ReplayFeed implements OfficeFeed {
  public readonly kind = 'replay' as const
  private events: OfficeEvent[]
  private startIso: Iso
  private readonly logUrl?: string
  private speed: number
  private readonly autoStartTimer: boolean

  private state: OfficeState | null = null
  private cursor = 0
  private currentMs = Date.parse(DEFAULT_START_ISO)
  private intervalId: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<(batch: OfficeEvent[]) => void>()
  private connectionListeners = new Set<(c: ConnectionState) => void>()

  constructor(options: ReplayFeedOptions = {}) {
    this.events = options.events ? [...options.events] : []
    this.startIso = options.startIso ?? DEFAULT_START_ISO
    this.logUrl = options.logUrl
    this.speed = options.speed ?? 30
    this.autoStartTimer = options.autoStartTimer ?? true
  }

  async start(config: OrgConfig): Promise<OfficeSnapshot> {
    this.stop()

    if (this.events.length === 0 && this.logUrl) {
      const resp = await fetch(this.logUrl)
      const data = (await resp.json()) as ReplayLogBundle | OfficeEvent[]
      if (!Array.isArray(data) && data.startIso) {
        this.startIso = data.startIso
      }
      const rawEvents = Array.isArray(data) ? data : data.events
      const validated: OfficeEvent[] = []
      for (const raw of rawEvents) {
        const res = parseEvent(raw)
        if (res.ok) validated.push(res.event)
      }
      this.events = validated
    }

    const startIso = this.startIso
    this.currentMs = Date.parse(startIso)
    this.cursor = 0
    this.state = initialState(config, startIso)

    if (this.autoStartTimer && this.events.length > 0) {
      this.intervalId = setInterval(() => {
        if (this.speed > 0) {
          this.advanceSimMs(250 * this.speed)
        }
      }, 250)
    }

    return {
      state: this.state,
      seq: this.state.seq,
    }
  }

  subscribe(onEvents: (batch: OfficeEvent[]) => void): () => void {
    this.listeners.add(onEvents)
    return () => {
      this.listeners.delete(onEvents)
    }
  }

  async send(cmd: Command): Promise<CommandAck> {
    return {
      commandId: cmd.id,
      status: 'rejected',
      reason: 'replay',
    }
  }

  now(): Iso {
    return new Date(this.currentMs).toISOString()
  }

  connection(): ConnectionState {
    return 'live'
  }

  onConnection(cb: (c: ConnectionState) => void): () => void {
    this.connectionListeners.add(cb)
    return () => {
      this.connectionListeners.delete(cb)
    }
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  setSpeed(speed: number): void {
    this.speed = speed
  }

  advanceSimMs(simDtMs: number): OfficeEvent[] {
    if (!this.state || simDtMs <= 0) return []
    this.currentMs += simDtMs
    const batch: OfficeEvent[] = []
    while (this.cursor < this.events.length) {
      const ev = this.events[this.cursor]!
      if (Date.parse(ev.at) <= this.currentMs) {
        batch.push(ev)
        this.cursor += 1
      } else {
        break
      }
    }
    if (batch.length > 0) {
      this.state = applyAll(this.state, batch)
      for (const listener of this.listeners) {
        listener(batch)
      }
    }
    if (this.cursor >= this.events.length) {
      this.stop()
    }
    return batch
  }

  replayAll(): OfficeState {
    if (!this.state) {
      throw new Error('ReplayFeed not started')
    }
    const remaining = this.events.slice(this.cursor)
    this.cursor = this.events.length
    if (remaining.length > 0) {
      this.currentMs = Date.parse(remaining[remaining.length - 1]!.at)
      this.state = applyAll(this.state, remaining)
      for (const listener of this.listeners) {
        listener(remaining)
      }
    }
    return this.state
  }

  getState(): OfficeState {
    if (!this.state) {
      throw new Error('ReplayFeed not started')
    }
    return this.state
  }
}

export function createReplayFeed(options?: ReplayFeedOptions): ReplayFeed {
  return new ReplayFeed(options)
}

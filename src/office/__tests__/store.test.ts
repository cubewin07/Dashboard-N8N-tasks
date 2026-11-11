import { afterEach, describe, expect, it, vi } from 'vitest'
import { StaticFeed } from '@/adapters/local/StaticFeed'
import type { Command, CommandAck } from '@/domain/commands'
import type { OrgConfig } from '@/domain/config'
import type { OfficeEvent } from '@/domain/events'
import { initialState } from '@/domain/reducer'
import { makeCommand, makeEvent, makeSampleTask } from '@/domain/__fixtures__/builders'
import type {
  ConnectionState,
  OfficeFeed,
  OfficeSnapshot,
} from '@/ports/OfficeFeed'
import { useConfigStore } from '../configStore'
import { createFeed } from '../feedRegistry'
import {
  bootOffice,
  getOfficeState,
  sendCommand,
  stopOffice,
  useOffice,
} from '../store'

class FakeFeed implements OfficeFeed {
  readonly kind = 'sim' as const
  private listeners = new Set<(batch: OfficeEvent[]) => void>()
  private connListeners = new Set<(c: ConnectionState) => void>()
  private conn: ConnectionState = 'live'
  public nextSendImpl: (cmd: Command) => Promise<CommandAck> = async (cmd) => ({
    commandId: cmd.id,
    status: 'accepted',
  })

  async start(config: OrgConfig): Promise<OfficeSnapshot> {
    return {
      state: initialState(config, '2026-11-10T02:00:00.000Z'),
      seq: 0,
    }
  }

  subscribe(onEvents: (batch: OfficeEvent[]) => void): () => void {
    this.listeners.add(onEvents)
    return () => {
      this.listeners.delete(onEvents)
    }
  }

  emit(batch: OfficeEvent[]): void {
    for (const cb of this.listeners) {
      cb(batch)
    }
  }

  async send(cmd: Command): Promise<CommandAck> {
    return this.nextSendImpl(cmd)
  }

  now(): string {
    return '2026-11-10T02:00:00.000Z'
  }

  connection(): ConnectionState {
    return this.conn
  }

  setConnection(c: ConnectionState): void {
    this.conn = c
    for (const cb of this.connListeners) {
      cb(c)
    }
  }

  onConnection(cb: (c: ConnectionState) => void): () => void {
    this.connListeners.add(cb)
    return () => {
      this.connListeners.delete(cb)
    }
  }

  stop(): void {
    this.listeners.clear()
    this.connListeners.clear()
  }
}

describe('office store, feedRegistry, and command tracking (P03-T12)', () => {
  afterEach(() => {
    stopOffice()
    vi.useRealTimers()
  })

  it('boots office state with StaticFeed (28 idle core staff and no tasks)', async () => {
    const state = await bootOffice(new StaticFeed())
    expect(useConfigStore.getState().status).toBe('ready')
    expect(useConfigStore.getState().config?.employees).toHaveLength(28)

    expect(state).toBe(getOfficeState())
    const people = Object.values(state.people)
    expect(people).toHaveLength(28)
    expect(people.every((p) => p.activity === 'idle')).toBe(true)
    expect(Object.keys(state.tasks)).toHaveLength(0)
    expect(useOffice.getState().connection).toBe('live')

    const cmd = makeCommand('intake.submit', { text: 'Test', modality: 'text' })
    const ack = await useOffice.getState().send(cmd)
    expect(ack).toEqual({
      commandId: cmd.id,
      status: 'rejected',
      reason: 'static_feed',
    })
    expect(useOffice.getState().commands[cmd.id]).toEqual({
      id: cmd.id,
      status: 'failed',
      reason: 'static_feed',
    })
  })

  it('createFeed("sim") selects SimFeed', () => {
    const feed = createFeed('sim')
    expect((feed as { kind?: string }).kind).toBe('sim')
    feed.stop()
  })

  it('tracks command lifecycle sending -> queued -> applied on causedBy event, and failed on rejected', async () => {
    vi.useFakeTimers()
    const fakeFeed = new FakeFeed()
    await bootOffice(fakeFeed)

    let resolveAck!: (ack: CommandAck) => void
    fakeFeed.nextSendImpl = () =>
      new Promise<CommandAck>((resolve) => {
        resolveAck = resolve
      })

    const cmd = makeCommand(
      'intake.submit',
      { text: 'Làm banner sale 12.12', modality: 'text' },
      { id: 'cmd_01JTESTCOMMAND000000000001' },
    )

    const sendPromise = sendCommand(cmd)

    // 1. Immediately transitions to 'sending'
    expect(useOffice.getState().commands[cmd.id]?.status).toBe('sending')

    // 2. Feed accepts command -> transitions to 'queued'
    resolveAck({ commandId: cmd.id, status: 'accepted' })
    await sendPromise
    expect(useOffice.getState().commands[cmd.id]?.status).toBe('queued')

    // 3. Feed emits event with causedBy: cmd.id -> batched until rAF fires
    fakeFeed.emit([
      makeEvent(
        'task.created',
        {
          task: makeSampleTask({
            id: 'task_01JTEST000000000000000001',
            typeKey: 'design.banner_set',
            title: 'Thiết kế bộ banner 12.12',
            departmentId: 'dep_design',
            priority: 'high',
            platformKey: 'shopee',
            requiredLevel: 'dept_manager',
          }),
        },
        { seq: 1, causedBy: cmd.id },
      ),
    ])

    // Before rAF fires, command is still 'queued'
    expect(useOffice.getState().commands[cmd.id]?.status).toBe('queued')

    // Advance timer by 1 frame (16ms) -> command transitions to 'applied'
    vi.advanceTimersByTime(20)
    expect(useOffice.getState().commands[cmd.id]?.status).toBe('applied')
    expect(
      useOffice.getState().state?.tasks['task_01JTEST000000000000000001']?.title,
    ).toBe('Thiết kế bộ banner 12.12')

    // 4. Rejected command transitions to 'failed' with reason
    fakeFeed.nextSendImpl = async (c) => ({
      commandId: c.id,
      status: 'rejected',
      reason: 'already_decided',
    })
    const rejectedCmd = makeCommand(
      'review.decide',
      {
        reviewId: 'rev_01JTEST000000000000000001',
        decision: 'approved',
      },
      { id: 'cmd_01JTESTCOMMAND000000000002' },
    )
    await sendCommand(rejectedCmd)
    expect(useOffice.getState().commands[rejectedCmd.id]).toEqual({
      id: rejectedCmd.id,
      status: 'failed',
      reason: 'already_decided',
    })
  })

  it('batches multiple event emissions within a single animation frame into one store update', async () => {
    vi.useFakeTimers()
    const fakeFeed = new FakeFeed()
    await bootOffice(fakeFeed)

    let stateUpdates = 0
    const unsub = useOffice.subscribe((state, prevState) => {
      if (state.state !== prevState.state) {
        stateUpdates += 1
      }
    })

    // Emit 3 separate batches before the frame fires
    fakeFeed.emit([
      makeEvent(
        'system.heartbeat',
        { source: 'sim', version: '1.0.0' },
        { seq: 1, at: '2026-11-10T02:01:00.000Z' },
      ),
    ])
    fakeFeed.emit([
      makeEvent(
        'system.heartbeat',
        { source: 'sim', version: '1.0.0' },
        { seq: 2, at: '2026-11-10T02:02:00.000Z' },
      ),
    ])
    fakeFeed.emit([
      makeEvent(
        'system.heartbeat',
        { source: 'sim', version: '1.0.0' },
        { seq: 3, at: '2026-11-10T02:03:00.000Z' },
      ),
    ])

    expect(stateUpdates).toBe(0)

    vi.advanceTimersByTime(20)

    expect(stateUpdates).toBe(1)
    expect(useOffice.getState().state?.seq).toBe(3)
    expect(useOffice.getState().state?.now).toBe('2026-11-10T02:03:00.000Z')

    unsub()
  })
})

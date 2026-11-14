import type { Command, CommandAck } from '@/domain/commands'
import type { OrgConfig } from '@/domain/config'
import type { OfficeEvent } from '@/domain/events'
import type { Iso } from '@/domain/primitives'
import { initialState } from '@/domain/reducer'
import type { ConnectionState, OfficeFeed, OfficeSnapshot } from '@/ports/OfficeFeed'

export class StaticFeed implements OfficeFeed {
  readonly kind = 'replay' as const

  async start(config: OrgConfig): Promise<OfficeSnapshot> {
    const state = initialState(config, this.now())
    return { state, seq: state.seq }
  }

  subscribe(_onEvents: (batch: OfficeEvent[]) => void): () => void {
    void _onEvents
    return () => {
      /* StaticFeed never emits runtime events */
    }
  }

  async send(cmd: Command): Promise<CommandAck> {
    return {
      commandId: cmd.id,
      status: 'rejected',
      reason: 'static_feed',
    }
  }

  now(): Iso {
    return new Date().toISOString()
  }

  connection(): ConnectionState {
    return 'live'
  }

  onConnection(_cb: (c: ConnectionState) => void): () => void {
    void _cb
    return () => {
      /* StaticFeed connection never changes */
    }
  }

  stop(): void {
    /* no-op */
  }
}

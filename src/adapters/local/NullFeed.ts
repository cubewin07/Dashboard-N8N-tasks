import type { Command, CommandAck } from '@/domain/commands'
import type { OrgConfig } from '@/domain/config'
import type { Iso } from '@/domain/primitives'
import { initialState } from '@/domain/reducer'
import type { ConnectionState, OfficeFeed, OfficeSnapshot } from '@/ports/OfficeFeed'

/**
 * The feed of a build without a simulator and without a real system yet (P11-T09).
 * Everyone from the config sits idle at their desk; nothing happens; commands are
 * refused with `no_feed`. It proves the 3D and 2D screens need nothing from the sim.
 */
export class NullFeed implements OfficeFeed {
  readonly kind = 'replay' as const

  async start(config: OrgConfig): Promise<OfficeSnapshot> {
    const state = initialState(config, this.now())
    return { state, seq: state.seq }
  }

  subscribe(): () => void {
    return () => {}
  }

  async send(cmd: Command): Promise<CommandAck> {
    return { commandId: cmd.id, status: 'rejected', reason: 'no_feed' }
  }

  now(): Iso {
    return new Date().toISOString()
  }

  /** The (empty) source is reachable: nothing is stale, there is just no activity. */
  connection(): ConnectionState {
    return 'live'
  }

  onConnection(): () => void {
    return () => {}
  }

  stop(): void {}
}

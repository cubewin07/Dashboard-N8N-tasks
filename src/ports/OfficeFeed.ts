import type { Command, CommandAck } from '@/domain/commands'
import type { OrgConfig } from '@/domain/config'
import type { OfficeEvent } from '@/domain/events'
import type { Iso } from '@/domain/primitives'
import type { OfficeState } from '@/domain/work'

export type ConnectionState = 'live' | 'reconnecting' | 'offline'

export interface OfficeSnapshot {
  state: OfficeState
  seq: number
}

export interface OfficeFeed {
  readonly kind: 'sim' | 'supabase' | 'replay'
  /** Load the current state. The sim builds it from config; the real feed reads projections. */
  start(config: OrgConfig): Promise<OfficeSnapshot>
  /** Events after the snapshot, in order. Returns an unsubscribe. */
  subscribe(onEvents: (batch: OfficeEvent[]) => void): () => void
  /** UI -> system. Resolves when accepted (not when applied). Result events follow via subscribe. */
  send(cmd: Command): Promise<CommandAck>
  /** Feed clock (sim time now; wall time for the real system). */
  now(): Iso
  /** Connection to the source: 'live' | 'reconnecting' | 'offline'. Drives LiveBadge. */
  connection(): ConnectionState
  onConnection(cb: (c: ConnectionState) => void): () => void
  stop(): void
}

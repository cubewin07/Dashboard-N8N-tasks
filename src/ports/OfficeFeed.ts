import type { Command, CommandAck } from '@/domain/commands'
import type { ConfigChange, OrgConfig } from '@/domain/config'
import type { OfficeEvent } from '@/domain/events'
import type { Iso } from '@/domain/primitives'
import type { OfficeState } from '@/domain/work'

export type ConnectionState = 'live' | 'reconnecting' | 'offline'

export interface OfficeSnapshot {
  state: OfficeState
  seq: number
}

/** v1.4: something the feed dropped instead of throwing (shown in Settings → Chẩn đoán). */
export interface FeedIssue {
  kind: 'invalid_event'
  /** Why it was dropped (zod path + message, or `unknown_event_type: …`). */
  reason: string
  /** The event id / type when the envelope had them. */
  eventId?: string | null
  type?: string | null
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
  /**
   * Optional: a feed that can restart its history (the sim's reset/seed change)
   * calls back with the fresh state so the store replaces, not appends.
   */
  onReset?(cb: (state: OfficeState) => void): () => void
  /**
   * v1.3, optional: the ConfigSource now holds `config` (a boss edit, `change` set; or a realtime
   * edit from elsewhere, `change` null). A feed that owns the office state (the sim) adopts it and
   * emits the resulting events: `staff.hired` / `staff.archived` for people who start or stop
   * being active (one per employee id), `config.changed` for the rest; nothing when nothing
   * differs. A feed without it gets the config swapped into the snapshot by the store.
   */
  reconfigure?(config: OrgConfig, change: ConfigChange | null): void
  /**
   * v1.4, optional: events the feed dropped because they failed validation. Never thrown to
   * the UI; the store counts them for the diagnostics list. Subscribed before `start`.
   */
  onIssue?(cb: (issue: FeedIssue) => void): () => void
  stop(): void
}

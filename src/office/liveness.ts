import type { ConnectionState } from '@/ports/OfficeFeed'

/** The worker pings once a minute; three missed pings mean the team is gone. */
export const HEARTBEAT_STALE_MS = 3 * 60_000

/**
 * R15: the team counts as online only while the connection is live AND the
 * last heartbeat is recent in feed time. A feed that has never sent one
 * (static org, no worker yet) is not penalised.
 */
export function isTeamOnline(
  connection: ConnectionState,
  heartbeatAt: string | null,
  feedNow: string | null,
): boolean {
  if (connection !== 'live') return false
  if (!heartbeatAt || !feedNow) return true
  return Date.parse(feedNow) - Date.parse(heartbeatAt) <= HEARTBEAT_STALE_MS
}

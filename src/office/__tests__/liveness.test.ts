import { describe, expect, it } from 'vitest'
import { HEARTBEAT_STALE_MS, isTeamOnline } from '../liveness'

const at = '2026-11-02T01:00:00.000Z'
const plus = (ms: number) => new Date(Date.parse(at) + ms).toISOString()

describe('isTeamOnline (R15)', () => {
  it('is offline whenever the connection is not live', () => {
    expect(isTeamOnline('offline', at, at)).toBe(false)
    expect(isTeamOnline('reconnecting', at, at)).toBe(false)
  })

  it('is online with a recent heartbeat', () => {
    expect(isTeamOnline('live', at, plus(60_000))).toBe(true)
    expect(isTeamOnline('live', at, plus(HEARTBEAT_STALE_MS))).toBe(true)
  })

  it('goes offline when the heartbeat is stale although the connection is live', () => {
    expect(isTeamOnline('live', at, plus(HEARTBEAT_STALE_MS + 1))).toBe(false)
  })

  it('does not penalise a feed that has never sent a heartbeat', () => {
    expect(isTeamOnline('live', null, at)).toBe(true)
  })
})

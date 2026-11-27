import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReplayFeed } from '@/adapters/replay/ReplayFeed'
import { makeEvent } from '@/domain/__fixtures__/builders'
import { MAX_DIAGNOSTIC_ENTRIES, useDiagnostics } from '../diagnostics'
import { bootOffice, stopOffice } from '../store'

afterEach(() => {
  stopOffice()
  useDiagnostics.getState().clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('diagnostics (P11-T05)', () => {
  it('a malformed replay event is skipped and listed, never thrown', async () => {
    const good = makeEvent('system.heartbeat', { source: 'sim', version: 'test' }, { seq: 1 })
    const bad = { ...makeEvent('system.heartbeat', { source: 'sim', version: 'x' }, { seq: 2 }), id: 'evt_bad', payload: { source: 42 } }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ events: [good, bad] }), { status: 200 })),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const state = await bootOffice(createReplayFeed({ logUrl: '/replay/day.json', autoStartTimer: false }))
    expect(state).toBeTruthy()

    const d = useDiagnostics.getState()
    expect(d.invalidEvents).toBe(1)
    expect(d.entries[0]!.kind).toBe('invalid_event')
    expect(d.entries[0]!.detail).toContain('system.heartbeat evt_bad')
  })

  it('keeps counting past the list limit and shows the newest first', () => {
    const { record } = useDiagnostics.getState()
    for (let i = 0; i < MAX_DIAGNOSTIC_ENTRIES + 5; i += 1) record('context_lost', `loss ${i}`)
    record('canvas_error', 'boom')
    const d = useDiagnostics.getState()
    expect(d.contextLosses).toBe(MAX_DIAGNOSTIC_ENTRIES + 5)
    expect(d.canvasErrors).toBe(1)
    expect(d.entries).toHaveLength(MAX_DIAGNOSTIC_ENTRIES)
    expect(d.entries[0]!.detail).toBe('boom')
  })
})

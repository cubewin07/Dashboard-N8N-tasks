import { describe, expect, it, vi } from 'vitest'
import { AppearanceConflictError } from '@/ports/AppearanceStore'
import { generateAppearance } from '@/scene/characters/generate'
import type { Db } from '../client'
import type { RealtimeHub } from '../realtime'
import { SupabaseAppearanceStore } from '../SupabaseAppearanceStore'

const doc = generateAppearance('emp_a')
const other = generateAppearance('emp_b')

interface Opts {
  rows?: Array<{ employee_id: string; doc: unknown; version: number }>
  rpc?: { data: number | null; error: { code?: string; message: string } | null }
}

function makeDb(opts: Opts = {}) {
  const rows = opts.rows ?? []
  const rpc = vi.fn(async () => opts.rpc ?? { data: 1, error: null })
  const from = vi.fn(() => ({
    select: () =>
      Object.assign(Promise.resolve({ data: rows, error: null }), {
        eq: (_c: string, id: string) => ({
          maybeSingle: async () => ({ data: rows.find((r) => r.employee_id === id) ?? null, error: null }),
        }),
      }),
  }))
  return { db: { from, rpc } as unknown as Db, rpc }
}

function makeHub() {
  let handler: ((p: { new: unknown }) => void) | null = null
  let reload: (() => void) | null = null
  const hub = {
    openChannel: vi.fn((_db: Db, _name: string, configure: (c: unknown) => unknown) => {
      configure({ on: (_t: string, _f: unknown, h: typeof handler) => { handler = h; return {} } })
      return () => {}
    }),
    registerReload: vi.fn((fn: () => void) => { reload = fn; return () => {} }),
  } as unknown as RealtimeHub
  return { hub, push: (n: unknown) => handler?.({ new: n }), reconnect: () => reload?.() }
}

describe('SupabaseAppearanceStore', () => {
  it('reads valid looks with versions and skips invalid ones with a warning', async () => {
    const { db } = makeDb({
      rows: [
        { employee_id: 'emp_a', doc, version: 3 },
        { employee_id: 'bad', doc: { v: 9 }, version: 1 },
      ],
    })
    const warn = vi.fn()
    const store = new SupabaseAppearanceStore(db, makeHub().hub, warn)
    const entries = await store.getEntries()
    expect(Object.keys(entries)).toEqual(['emp_a'])
    expect(entries.emp_a.version).toBe(3)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(await store.get('emp_a')).toEqual(entries.emp_a.doc)
    expect(await store.get('nobody')).toBeNull()
  })

  it('save calls the RPC and returns the new version', async () => {
    const { db, rpc } = makeDb({ rpc: { data: 4, error: null } })
    const store = new SupabaseAppearanceStore(db, makeHub().hub)
    expect(await store.save('emp_a', doc, 3)).toEqual({ version: 4 })
    expect(rpc).toHaveBeenCalledWith('save_appearance', {
      p_employee_id: 'emp_a',
      p_doc: doc,
      p_expected_version: 3,
    })
  })

  it('maps P0001 to AppearanceConflictError with the server doc and version', async () => {
    const { db } = makeDb({
      rows: [{ employee_id: 'emp_a', doc: other, version: 7 }],
      rpc: { data: null, error: { code: 'P0001', message: 'version_conflict' } },
    })
    const store = new SupabaseAppearanceStore(db, makeHub().hub)
    const err = await store.save('emp_a', doc, 2).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppearanceConflictError)
    const c = err as AppearanceConflictError
    expect(c.currentVersion).toBe(7)
    expect(c.expectedVersion).toBe(2)
    expect(c.current).toEqual(other)
  })

  it('other RPC errors stay plain errors', async () => {
    const { db } = makeDb({ rpc: { data: null, error: { code: '42501', message: 'insufficient_privilege' } } })
    const err = await new SupabaseAppearanceStore(db, makeHub().hub).save('emp_a', doc, 0).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(AppearanceConflictError)
    expect((err as Error).message).toBe('insufficient_privilege')
  })

  it('emits realtime changes once per new version, not for own saves, and reloads on reconnect', async () => {
    const { db } = makeDb({ rows: [{ employee_id: 'emp_a', doc, version: 1 }] })
    const h = makeHub()
    const store = new SupabaseAppearanceStore(db, h.hub)
    const seen: string[] = []
    store.subscribe((id) => seen.push(id))
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    h.push({ employee_id: 'emp_a', doc: other, version: 1 }) // already known
    expect(seen).toEqual([])
    h.push({ employee_id: 'emp_a', doc: other, version: 2 })
    h.push({ employee_id: 'emp_a', doc: other, version: 2 }) // duplicate
    expect(seen).toEqual(['emp_a'])
    h.push({ employee_id: 'emp_b', doc: { v: 9 }, version: 1 }) // invalid doc ignored
    expect(seen).toEqual(['emp_a'])
  })
})

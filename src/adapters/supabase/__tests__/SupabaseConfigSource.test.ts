import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBundledRawConfig } from '@/adapters/local/LocalConfigSource'
import { parseOrgConfig } from '@/domain/config'
import type { Db } from '../client'
import { toRows, type ConfigRows } from '../configRows'
import { RealtimeHub } from '../realtime'
import { SupabaseConfigSource } from '../SupabaseConfigSource'

function mockDb(rows: ConfigRows, errorTable?: string) {
  const handlers: (() => void)[] = []
  const channel = {
    on: vi.fn((_t: string, _f: unknown, h: () => void) => {
      handlers.push(h)
      return channel
    }),
    subscribe: vi.fn(),
  }
  const db = {
    from: vi.fn((t: keyof ConfigRows) =>
      ({
        select: () =>
          Promise.resolve(
            t === errorTable
              ? { data: null, error: { message: 'boom' } }
              : { data: rows[t], error: null },
          ),
      }),
    ),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  }
  return { db: db as unknown as Db, raw: db, channel, handlers }
}

describe('SupabaseConfigSource', () => {
  const full = toRows(getBundledRawConfig())

  it('loads the full config', async () => {
    const { db } = mockDb(full)
    const cfg = await new SupabaseConfigSource(db, new RealtimeHub()).load()
    expect(cfg).toEqual(parseOrgConfig(getBundledRawConfig()))
  })

  it('validates a reduced stylist view', async () => {
    const reduced: ConfigRows = {
      ...full,
      specialties: [],
      platforms: [],
      shops: [],
      task_types: [],
      approval_rules: [],
      policy: [],
    }
    const { db } = mockDb(reduced)
    const cfg = await new SupabaseConfigSource(db, new RealtimeHub()).load()
    expect(cfg.platforms.length).toBeGreaterThan(0)
    expect(cfg.policy).toBeDefined()
    expect(cfg.departments.length).toBe(full.departments.length)
  })

  it('throws on query errors', async () => {
    const { db } = mockDb(full, 'roles')
    await expect(new SupabaseConfigSource(db, new RealtimeHub()).load()).rejects.toThrow(/roles/)
  })

  it('apply is not supported', async () => {
    const { db } = mockDb(full)
    await expect(
      new SupabaseConfigSource(db, new RealtimeHub()).apply({ kind: 'config.replace' } as never),
    ).rejects.toMatchObject({ code: 'unknown' })
  })

  describe('subscribe', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('debounces changes into one reload and cleans up', async () => {
      const { db, raw, channel, handlers } = mockDb(full)
      const hub = new RealtimeHub()
      const src = new SupabaseConfigSource(db, hub)
      const cb = vi.fn()
      const off = src.subscribe(cb)
      expect(raw.channel).toHaveBeenCalledWith('config')
      expect(handlers.length).toBe(9)
      handlers[0]()
      handlers[3]()
      handlers[5]()
      await vi.advanceTimersByTimeAsync(149)
      expect(cb).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(5)
      expect(cb).toHaveBeenCalledTimes(1)
      expect(raw.from).toHaveBeenCalledTimes(9)

      // reconnect reload
      const status = channel.subscribe.mock.calls[0][0] as (s: string) => void
      status('CHANNEL_ERROR')
      status('SUBSCRIBED') // first live: no reload
      status('CHANNEL_ERROR')
      status('SUBSCRIBED')
      await vi.advanceTimersByTimeAsync(0)
      expect(cb).toHaveBeenCalledTimes(2)

      off()
      expect(raw.removeChannel).toHaveBeenCalled()
    })
  })
})

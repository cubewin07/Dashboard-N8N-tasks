import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBundledRawConfig } from '@/adapters/local/LocalConfigSource'
import { parseOrgConfig, type ConfigChange } from '@/domain/config'
import { ConfigError } from '@/ports/ConfigSource'
import type { Db } from '../client'
import { toRows, type ConfigRows } from '../configRows'
import { RealtimeHub } from '../realtime'
import { SupabaseConfigSource } from '../SupabaseConfigSource'

interface MockOptions {
  errorTable?: string
  rpc?: { error: { code?: string; message?: string } | null } | Error
  audit?: unknown[]
  users?: { user_id: string; display_name: string }[]
}

function mockDb(rows: ConfigRows, errorTable?: string, opts: MockOptions = {}) {
  const handlers: (() => void)[] = []
  const channel = {
    on: vi.fn((_t: string, _f: unknown, h: () => void) => {
      handlers.push(h)
      return channel
    }),
    subscribe: vi.fn(),
  }
  const auditCalls: [string, ...unknown[]][] = []
  const rpc = vi.fn((...args: [string, unknown]) => {
    void args
    const r = opts.rpc ?? { error: null }
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r)
  })
  const db = {
    rpc,
    from: vi.fn((t: string) => {
      if (t === 'config_audit' || t === 'app_users') {
        const result = { data: t === 'config_audit' ? (opts.audit ?? []) : (opts.users ?? []), error: null }
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'order', 'limit', 'in']) {
          q[m] = (...args: unknown[]) => {
            auditCalls.push([`${t}.${m}`, ...args])
            return q
          }
        }
        q.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
        return q
      }
      return {
        select: () =>
          Promise.resolve(
            t === errorTable
              ? { data: null, error: { message: 'boom' } }
              : { data: rows[t as keyof ConfigRows], error: null },
          ),
      }
    }),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  }
  return { db: db as unknown as Db, raw: db, channel, handlers, rpc, auditCalls }
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

  describe('apply', () => {
    const cfg = parseOrgConfig(getBundledRawConfig())
    const dep = cfg.departments[0]
    const changes: [ConfigChange, string, unknown][] = [
      [{ kind: 'department.upsert', department: dep }, 'upsert_department', { p: dep }],
      [{ kind: 'department.reorder', ids: ['dep_b', 'dep_a'] }, 'reorder_departments', { p_ids: ['dep_b', 'dep_a'] }],
      [{ kind: 'role.upsert', role: cfg.roles[0] }, 'upsert_role', { p: cfg.roles[0] }],
      [{ kind: 'role.delete', key: 'custom' }, 'delete_role', { p_key: 'custom' }],
      [{ kind: 'specialty.upsert', specialty: cfg.specialties[0] }, 'upsert_specialty', { p: cfg.specialties[0] }],
      [{ kind: 'specialty.delete', key: 'old' }, 'delete_specialty', { p_key: 'old' }],
      [{ kind: 'employee.upsert', employee: cfg.employees[0] }, 'upsert_employee', { p: cfg.employees[0] }],
      [{ kind: 'employee.archive', id: 'emp_x', reason: 'dismissed' }, 'archive_employee', { p_id: 'emp_x', p_reason: 'dismissed' }],
      [{ kind: 'employee.restore', id: 'emp_x' }, 'restore_employee', { p_id: 'emp_x' }],
      [{ kind: 'policy.set', policy: cfg.policy }, 'set_policy', { p: cfg.policy }],
      [{ kind: 'rule.upsert', rule: cfg.approvalRules[0] }, 'upsert_approval_rule', { p: cfg.approvalRules[0] }],
      [{ kind: 'rule.delete', id: 'r1' }, 'delete_approval_rule', { p_id: 'r1' }],
      [{ kind: 'rule.reorder', ids: ['b', 'a'] }, 'reorder_approval_rules', { p_ids: ['b', 'a'] }],
      [{ kind: 'platform.upsert', platform: cfg.platforms[0] }, 'upsert_platform', { p: cfg.platforms[0] }],
      [{ kind: 'shop.upsert', shop: cfg.shops[0] }, 'upsert_shop', { p: cfg.shops[0] }],
      [{ kind: 'taskType.upsert', taskType: cfg.taskTypes[0] }, 'upsert_task_type', { p: cfg.taskTypes[0] }],
    ]

    it.each(changes)('maps %j to one RPC', async (change, name, args) => {
      const { db, rpc } = mockDb(full)
      await new SupabaseConfigSource(db, new RealtimeHub()).apply(change)
      expect(rpc).toHaveBeenCalledTimes(1)
      expect(rpc).toHaveBeenCalledWith(name, args)
    })

    it('config.replace sends only the editable parts', async () => {
      const { db, rpc } = mockDb(full)
      await new SupabaseConfigSource(db, new RealtimeHub()).apply({ kind: 'config.replace', config: cfg })
      expect(rpc).toHaveBeenCalledTimes(1)
      const [name, args] = rpc.mock.calls[0] as [string, { p: Record<string, unknown> }]
      expect(name).toBe('replace_config')
      expect(Object.keys(args.p).sort()).toEqual(
        ['approvalRules', 'departments', 'employees', 'platforms', 'policy', 'roles', 'shops', 'specialties', 'taskTypes'],
      )
    })

    it.each([
      [{ code: '42501', message: 'insufficient_privilege' }, 'forbidden'],
      [{ code: '22023', message: 'invalid_payload: missing key' }, 'invalid'],
      [{ code: '23503', message: 'role_in_use: 2 holder(s)' }, 'invalid'],
      [{ code: '23514', message: 'check violation' }, 'invalid'],
      [{ code: 'P0002', message: 'unknown_rule' }, 'not_found'],
      [{ code: '23503', message: 'unknown_employee' }, 'not_found'],
      [{ code: '', message: 'TypeError: Failed to fetch' }, 'network'],
      [{ code: 'XX000', message: 'boom' }, 'unknown'],
    ])('maps the RPC error %j to ConfigError(%s)', async (error, code) => {
      const { db } = mockDb(full, undefined, { rpc: { error } })
      const p = new SupabaseConfigSource(db, new RealtimeHub()).apply({ kind: 'role.delete', key: 'x' })
      await expect(p).rejects.toBeInstanceOf(ConfigError)
      await expect(p).rejects.toMatchObject({ code, message: error.message })
    })

    it('maps a thrown fetch failure to network', async () => {
      const { db } = mockDb(full, undefined, { rpc: new TypeError('Failed to fetch') })
      await expect(
        new SupabaseConfigSource(db, new RealtimeHub()).apply({ kind: 'rule.delete', id: 'r' }),
      ).rejects.toMatchObject({ code: 'network' })
    })

    it('a stylist (RPC answers 42501) is forbidden and nothing is reloaded', async () => {
      const { db, raw } = mockDb(full, undefined, { rpc: { error: { code: '42501', message: 'insufficient_privilege' } } })
      const src = new SupabaseConfigSource(db, new RealtimeHub())
      await expect(src.apply({ kind: 'policy.set', policy: cfg.policy })).rejects.toMatchObject({ code: 'forbidden' })
      expect(raw.from).not.toHaveBeenCalled()
    })

    it('a successful apply reloads and notifies subscribers', async () => {
      vi.useFakeTimers()
      try {
        const { db } = mockDb(full)
        const src = new SupabaseConfigSource(db, new RealtimeHub())
        const cb = vi.fn()
        src.subscribe(cb)
        await src.apply({ kind: 'rule.delete', id: 'r' })
        expect(cb).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(200)
        expect(cb).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('history', () => {
    const A = '10000000-0000-0000-0000-000000000001'
    const B = '10000000-0000-0000-0000-000000000002'

    it('reads config_audit newest first and resolves actor names', async () => {
      const audit = [
        { id: 7, at: '2026-11-26T10:00:00Z', actor: A, entity: 'roles', entity_id: 'x', action: 'delete', before: { key: 'x' }, after: null },
        { id: 6, at: '2026-11-26T09:00:00Z', actor: B, entity: 'config', entity_id: '*', action: 'replace', before: { employees: 1 }, after: { employees: 2 } },
      ]
      const { db, auditCalls } = mockDb(full, undefined, {
        audit,
        users: [{ user_id: A, display_name: 'Boss' }],
      })
      const out = await new SupabaseConfigSource(db, new RealtimeHub()).history(50)
      expect(out).toEqual([
        { id: '7', at: '2026-11-26T10:00:00Z', actor: { id: A, name: 'Boss' }, entity: 'roles', entityId: 'x', action: 'delete', before: { key: 'x' }, after: null },
        { id: '6', at: '2026-11-26T09:00:00Z', actor: { id: B, name: B.slice(0, 8) }, entity: 'config', entityId: '*', action: 'replace', before: { employees: 1 }, after: { employees: 2 } },
      ])
      expect(auditCalls).toContainEqual(['config_audit.order', 'at', { ascending: false }])
      expect(auditCalls).toContainEqual(['config_audit.limit', 50])
    })

    it('returns [] without an app_users lookup when there are no rows', async () => {
      const { db, raw } = mockDb(full)
      expect(await new SupabaseConfigSource(db, new RealtimeHub()).history()).toEqual([])
      expect(raw.from).toHaveBeenCalledTimes(1)
    })
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

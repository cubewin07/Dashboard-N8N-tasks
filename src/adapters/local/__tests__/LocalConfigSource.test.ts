import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseOrgConfig } from '@/domain/config'
import type { ConfigActor } from '@/ports/ConfigSource'
import {
  CONFIG_AUDIT_KEY,
  CONFIG_AUDIT_LIMIT,
  CONFIG_OVERRIDES_KEY,
  ConfigError,
  getBundledRawConfig,
  LocalConfigSource,
} from '../LocalConfigSource'

const BOSS: ConfigActor = { userId: 'u_boss', role: 'boss', displayName: 'Sếp' }
const STYLIST: ConfigActor = { userId: 'u_style', role: 'stylist', displayName: 'Stylist' }

describe('LocalConfigSource', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads the bundled seed config when no overrides are present', async () => {
    const source = new LocalConfigSource()
    const cfg = await source.load()
    expect(cfg.departments).toHaveLength(4)
    expect(cfg.employees).toHaveLength(28)
  })

  it('deep-merges valid localStorage overrides', async () => {
    storage.set(
      CONFIG_OVERRIDES_KEY,
      JSON.stringify({
        v: 1,
        patch: {
          policy: {
            staffing: {
              tempCap: 15,
              dropOrder: 'longest_idle_first',
              minIdleMinutesBeforeDrop: 60,
            },
          },
        },
      }),
    )
    const source = new LocalConfigSource()
    const cfg = await source.load()
    expect(cfg.policy.staffing.tempCap).toBe(15)
  })

  it('ignores invalid localStorage overrides with a console warning and never crashes', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    storage.set(
      CONFIG_OVERRIDES_KEY,
      JSON.stringify({
        v: 1,
        patch: {
          employees: [{ id: 'emp_bad', roleKey: 'unknown_role' }],
        },
      }),
    )
    const source = new LocalConfigSource()
    const cfg = await source.load()
    expect(cfg.employees).toHaveLength(28)
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  describe('apply', () => {
    const bossSource = (extra: { now?: () => Date } = {}) =>
      new LocalConfigSource({ getActor: () => BOSS, ...extra })

    it('refuses without an actor and for a stylist, and stores nothing', async () => {
      const change = { kind: 'role.delete', key: 'worker' } as const
      await expect(new LocalConfigSource().apply(change)).rejects.toMatchObject({ code: 'forbidden' })
      await expect(
        new LocalConfigSource({ getActor: () => STYLIST }).apply(change),
      ).rejects.toBeInstanceOf(ConfigError)
      await expect(
        new LocalConfigSource({ getActor: () => STYLIST }).apply(change),
      ).rejects.toMatchObject({ code: 'forbidden' })
      expect(storage.size).toBe(0)
    })

    it('rejects an invalid result with its issues and stores nothing', async () => {
      const seed = parseOrgConfig(getBundledRawConfig())
      const employee = { ...seed.employees[0], roleKey: 'no_such_role' }
      const source = bossSource()
      const err = await source.apply({ kind: 'employee.upsert', employee }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ConfigError)
      expect((err as ConfigError).code).toBe('invalid')
      expect((err as ConfigError).issues.length).toBeGreaterThan(0)
      expect(storage.size).toBe(0)
      expect(await source.history()).toEqual([])
    })

    it('reports a missing archive / delete target as not_found', async () => {
      const source = bossSource()
      await expect(source.apply({ kind: 'employee.archive', id: 'emp_nope', reason: 'dismissed' })).rejects.toMatchObject({
        code: 'not_found',
      })
      await expect(source.apply({ kind: 'role.delete', key: 'nope' })).rejects.toMatchObject({ code: 'not_found' })
      expect(storage.size).toBe(0)
    })

    it('saves a valid change, notifies subscribers, and survives a new instance', async () => {
      const seed = parseOrgConfig(getBundledRawConfig())
      const source = bossSource()
      const cb = vi.fn()
      source.subscribe(cb)
      const department = { ...seed.departments[0], label: { vi: 'Đổi tên', en: 'Renamed' } }
      await source.apply({ kind: 'department.upsert', department })

      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb.mock.calls[0][0].departments[0].label.vi).toBe('Đổi tên')

      const stored = JSON.parse(storage.get(CONFIG_OVERRIDES_KEY) ?? 'null')
      expect(stored.v).toBe(1)
      expect(Object.keys(stored.patch)).toEqual(['departments'])

      const reloaded = await new LocalConfigSource().load()
      expect(reloaded.departments[0].label.vi).toBe('Đổi tên')
      expect(reloaded.employees).toHaveLength(28)
    })

    it('unsubscribed callbacks are not called', async () => {
      const source = bossSource()
      const cb = vi.fn()
      source.subscribe(cb)()
      await source.apply({ kind: 'policy.set', policy: (await source.load()).policy })
      expect(cb).not.toHaveBeenCalled()
    })

    it('stamps archivedAt with the injected clock', async () => {
      const source = bossSource({ now: () => new Date('2026-11-26T03:00:00.000Z') })
      await source.apply({ kind: 'employee.archive', id: 'emp_giam_doc', reason: 'dismissed' })
      const cfg = await source.load()
      const e = cfg.employees.find((x) => x.id === 'emp_giam_doc')
      expect(e?.state).toBe('archived')
      expect(e?.archivedAt).toBe('2026-11-26T03:00:00.000Z')
    })

    it('records a history row with the actor and before / after', async () => {
      const seed = parseOrgConfig(getBundledRawConfig())
      const source = bossSource({ now: () => new Date('2026-11-26T03:00:00.000Z') })
      const department = { ...seed.departments[1], label: { vi: 'Mới', en: 'New' } }
      await source.apply({ kind: 'department.upsert', department })

      const rows = await source.history()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        at: '2026-11-26T03:00:00.000Z',
        actor: { id: 'u_boss', name: 'Sếp' },
        entity: 'departments',
        entityId: department.id,
        action: 'upsert',
        before: seed.departments[1],
        after: department,
      })
      expect(rows[0].id).toMatch(/^[0-9A-Z]{26}$/)
    })

    it('records the ordered ids for a reorder and the policy for policy.set', async () => {
      const seed = parseOrgConfig(getBundledRawConfig())
      const ids = seed.departments.map((d) => d.id)
      const reversed = [...ids].reverse()
      const source = bossSource()
      await source.apply({ kind: 'department.reorder', ids: reversed })
      const [row] = await source.history()
      expect(row.entityId).toBe('*')
      expect(row.before).toEqual(ids)
      expect(row.after).toEqual(reversed)
      const cfg = await source.load()
      expect([...cfg.departments].sort((a, b) => a.order - b.order).map((d) => d.id)).toEqual(reversed)
    })

    it('keeps the last 200 history rows, newest first', async () => {
      const seed = parseOrgConfig(getBundledRawConfig())
      let tick = 0
      const source = bossSource({ now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)) })
      const total = CONFIG_AUDIT_LIMIT + 5
      for (let i = 0; i < total; i++) {
        const policy = {
          ...seed.policy,
          staffing: { ...seed.policy.staffing, tempCap: (i % 20) + 1 },
        }
        await source.apply({ kind: 'policy.set', policy })
      }
      const rows = await source.history()
      expect(rows).toHaveLength(CONFIG_AUDIT_LIMIT)
      // each apply reads the clock twice (stamp + id), so compare ordering, not exact seconds
      expect(rows[0].at > rows[rows.length - 1].at).toBe(true)
      expect(rows.every((r, i) => i === 0 || rows[i - 1].at >= r.at)).toBe(true)
      expect(JSON.parse(storage.get(CONFIG_AUDIT_KEY) ?? '[]')).toHaveLength(CONFIG_AUDIT_LIMIT)
      expect(await source.history(3)).toHaveLength(3)
    })

    it('config.replace with the seed clears the overrides', async () => {
      const seed = parseOrgConfig(getBundledRawConfig())
      const source = bossSource()
      await source.apply({
        kind: 'policy.set',
        policy: { ...seed.policy, staffing: { ...seed.policy.staffing, tempCap: 3 } },
      })
      expect(storage.has(CONFIG_OVERRIDES_KEY)).toBe(true)

      await source.apply({ kind: 'config.replace', config: seed })
      expect(storage.has(CONFIG_OVERRIDES_KEY)).toBe(false)
      expect((await new LocalConfigSource().load()).policy.staffing.tempCap).toBe(seed.policy.staffing.tempCap)
      const rows = await source.history()
      expect(rows[0]).toMatchObject({ entity: 'config', entityId: '*', action: 'replace' })
    })

    it('config.replace keeps building, floor templates and palette from the current config', async () => {
      const seed = parseOrgConfig(getBundledRawConfig())
      const source = bossSource()
      await source.apply({
        kind: 'config.replace',
        config: { ...seed, building: { ...seed.building, name: 'Hacked' } as typeof seed.building },
      })
      expect(storage.has(CONFIG_OVERRIDES_KEY)).toBe(false)
      expect((await source.load()).building).toEqual(seed.building)
    })

    it('throws ConfigError("unknown") when storage refuses the save, and notifies nobody', async () => {
      const seed = parseOrgConfig(getBundledRawConfig())
      vi.stubGlobal('localStorage', {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
        removeItem: () => {},
      })
      const source = bossSource()
      const cb = vi.fn()
      source.subscribe(cb)
      await expect(
        source.apply({ kind: 'policy.set', policy: { ...seed.policy, staffing: { ...seed.policy.staffing, tempCap: 4 } } }),
      ).rejects.toMatchObject({ code: 'unknown' })
      expect(cb).not.toHaveBeenCalled()
    })

    it('does not crash when storage reads throw (private mode)', async () => {
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('denied')
        },
        setItem: () => {},
        removeItem: () => {},
      })
      const source = bossSource()
      expect((await source.load()).employees).toHaveLength(28)
      expect(await source.history()).toEqual([])
    })

    it('keeps a hand-written override of a non-editable part', async () => {
      storage.set(CONFIG_OVERRIDES_KEY, JSON.stringify({ v: 1, patch: { palette: parseOrgConfig(getBundledRawConfig()).palette } }))
      const seed = parseOrgConfig(getBundledRawConfig())
      await bossSource().apply({
        kind: 'policy.set',
        policy: { ...seed.policy, staffing: { ...seed.policy.staffing, tempCap: 5 } },
      })
      const patch = JSON.parse(storage.get(CONFIG_OVERRIDES_KEY) ?? '{}').patch
      expect(Object.keys(patch).sort()).toEqual(['palette', 'policy'])
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONFIG_OVERRIDES_KEY,
  ConfigError,
  LocalConfigSource,
} from '../LocalConfigSource'

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

  it('throws ConfigError("not_implemented") on apply()', async () => {
    const source = new LocalConfigSource()
    await expect(
      source.apply({ kind: 'role.delete', key: 'custom' }),
    ).rejects.toBeInstanceOf(ConfigError)
  })
})

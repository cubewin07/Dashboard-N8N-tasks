import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Command, CommandAck } from '@/domain/commands'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { ConfigChange, OrgConfig } from '@/domain/config'
import type { ConfigAuditEntry } from '@/domain/configChange'
import type { OfficeEvent } from '@/domain/events'
import { initialState } from '@/domain/reducer'
import { ConfigError, type ConfigActor, type ConfigSource } from '@/ports/ConfigSource'
import type { ConnectionState, OfficeFeed, OfficeSnapshot } from '@/ports/OfficeFeed'
import {
  applyConfigEdit,
  loadConfig,
  setConfigActorGetter,
  setConfigSource,
  useConfigStore,
} from '../configStore'
import { bootOffice, stopOffice } from '../store'

const NOW = '2026-11-10T02:00:00.000Z'
const boss: ConfigActor = { userId: 'u_boss', role: 'boss', displayName: 'Sếp' }
const stylist: ConfigActor = { userId: 'u_sty', role: 'stylist', displayName: 'Stylist' }

class FakeSource implements ConfigSource {
  applied: ConfigChange[] = []
  applyImpl: (change: ConfigChange) => Promise<void> = async () => {}
  private listeners = new Set<(c: OrgConfig) => void>()
  constructor(public config: OrgConfig) {}
  async load(): Promise<OrgConfig> {
    return this.config
  }
  subscribe(cb: (c: OrgConfig) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  push(c: OrgConfig): void {
    for (const cb of this.listeners) cb(c)
  }
  async apply(change: ConfigChange): Promise<void> {
    this.applied.push(change)
    await this.applyImpl(change)
  }
  async history(): Promise<ConfigAuditEntry[]> {
    return []
  }
}

class FakeFeed implements OfficeFeed {
  readonly kind = 'sim' as const
  reconfigured: { config: OrgConfig; change: ConfigChange | null }[] = []
  private listeners = new Set<(batch: OfficeEvent[]) => void>()
  async start(config: OrgConfig): Promise<OfficeSnapshot> {
    return { state: initialState(config, NOW), seq: 0 }
  }
  subscribe(cb: (batch: OfficeEvent[]) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  emit(batch: OfficeEvent[]): void {
    for (const cb of this.listeners) cb(batch)
  }
  async send(cmd: Command): Promise<CommandAck> {
    return { commandId: cmd.id, status: 'accepted' }
  }
  now(): string {
    return NOW
  }
  connection(): ConnectionState {
    return 'live'
  }
  onConnection(): () => void {
    return () => {}
  }
  reconfigure(config: OrgConfig, change: ConfigChange | null): void {
    this.reconfigured.push({ config, change })
  }
  stop(): void {}
}

function renameFirstDepartment(cfg: OrgConfig, name: string): ConfigChange {
  const dept = cfg.departments[0]!
  return { kind: 'department.upsert', department: { ...dept, label: { vi: name, en: name } } }
}

let source: FakeSource
let actor: ConfigActor | null

beforeEach(async () => {
  source = new FakeSource(makeSeedConfig())
  actor = boss
  setConfigActorGetter(() => actor)
  setConfigSource(source)
  await loadConfig()
})

afterEach(() => {
  stopOffice()
  vi.restoreAllMocks()
})

describe('applyConfigEdit (P10 R10, R11, R15, D4)', () => {
  it('refuses a stylist or a signed-out session', async () => {
    actor = stylist
    await expect(applyConfigEdit(renameFirstDepartment(source.config, 'X'))).rejects.toMatchObject({
      code: 'forbidden',
    })
    actor = null
    await expect(applyConfigEdit(renameFirstDepartment(source.config, 'X'))).rejects.toBeInstanceOf(
      ConfigError,
    )
    expect(source.applied).toEqual([])
  })

  it('refuses an invalid result with issues and changes nothing', async () => {
    const before = useConfigStore.getState().config
    const emp = source.config.employees[0]!
    const change: ConfigChange = {
      kind: 'employee.upsert',
      employee: { ...emp, departmentId: 'dep_missing' },
    }
    const err = await applyConfigEdit(change).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConfigError)
    expect((err as ConfigError).code).toBe('invalid')
    expect((err as ConfigError).issues.length).toBeGreaterThan(0)
    expect(useConfigStore.getState().config).toBe(before)
    expect(source.applied).toEqual([])
  })

  it('shows the change at once, before the source confirms', async () => {
    let release: () => void = () => {}
    source.applyImpl = () => new Promise<void>((r) => (release = r))
    const pending = applyConfigEdit(renameFirstDepartment(source.config, 'Kho vận'))
    const s = useConfigStore.getState()
    expect(s.config?.departments[0]?.label.vi).toBe('Kho vận')
    expect(s.origin).toBe('ui')
    expect(s.lastChange?.kind).toBe('department.upsert')
    release()
    await pending
    expect(source.applied).toHaveLength(1)
  })

  it('rolls back and rethrows when the source fails', async () => {
    const before = useConfigStore.getState().config
    source.applyImpl = async () => {
      throw new ConfigError('network')
    }
    await expect(applyConfigEdit(renameFirstDepartment(source.config, 'Lỗi'))).rejects.toMatchObject({
      code: 'network',
    })
    const s = useConfigStore.getState()
    expect(s.config).toBe(before)
    expect(s.origin).toBe('rollback')
  })

  it('wraps a non-ConfigError failure as unknown', async () => {
    source.applyImpl = async () => {
      throw new Error('boom')
    }
    await expect(applyConfigEdit(renameFirstDepartment(source.config, 'Y'))).rejects.toMatchObject({
      code: 'unknown',
    })
  })
})

describe('review fixes', () => {
  it('a replace stores the normalized config, so omitted people are archived in every adapter', async () => {
    const gone = source.config.employees.find((e) => e.state === 'active' && e.roleKey === 'worker')!
    const incoming = { ...source.config, employees: source.config.employees.filter((e) => e.id !== gone.id) }
    await applyConfigEdit({ kind: 'config.replace', config: incoming })
    const sent = source.applied[0]
    expect(sent?.kind).toBe('config.replace')
    const stored = sent?.kind === 'config.replace' ? sent.config.employees.find((e) => e.id === gone.id) : null
    expect(stored?.state).toBe('archived')
  })

  it('a remote push that lands while a write is in flight waits, then the source is reloaded once', async () => {
    let release: () => void = () => {}
    source.applyImpl = () => new Promise<void>((r) => (release = r))
    const change = renameFirstDepartment(source.config, 'Kho vận')
    const pending = applyConfigEdit(change)
    const loads = vi.spyOn(source, 'load')

    // A stale echo from an earlier write: it must not wipe the optimistic edit.
    source.push(makeSeedConfig())
    expect(useConfigStore.getState().config?.departments[0]?.label.vi).toBe('Kho vận')

    source.config = { ...source.config, departments: [change.kind === 'department.upsert' ? change.department : source.config.departments[0]!, ...source.config.departments.slice(1)] }
    release()
    await pending
    await vi.waitFor(() => expect(loads).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(useConfigStore.getState().origin).toBe('remote'))
    expect(useConfigStore.getState().config?.departments[0]?.label.vi).toBe('Kho vận')
  })

  it('a remote push with no write in flight applies at once', () => {
    const remote = { ...source.config, departments: source.config.departments.slice() }
    source.push(remote)
    expect(useConfigStore.getState().config).toBe(remote)
  })
})

describe('config → feed forwarding (P10 §3.2)', () => {
  it('passes a boss edit with its change, and a remote push without one', async () => {
    const feed = new FakeFeed()
    await bootOffice(feed)
    const change = renameFirstDepartment(source.config, 'Kho vận')
    await applyConfigEdit(change)
    expect(feed.reconfigured.at(-1)?.change).toEqual(change)

    const remote = { ...source.config, departments: source.config.departments.slice() }
    source.push(remote)
    expect(feed.reconfigured.at(-1)).toEqual({ config: remote, change: null })
  })

  it('stores a hire the sim made itself once, and does not echo it back to the feed', async () => {
    const feed = new FakeFeed()
    await bootOffice(feed)
    const template = source.config.employees.find((e) => e.kind === 'temp') ?? source.config.employees.at(-1)!
    const employee = { ...template, id: 'emp_sim_new', name: 'Người mới' }
    const hired = {
      type: 'staff.hired',
      seq: 1,
      at: NOW,
      causedBy: null,
      payload: { employee },
    } as unknown as OfficeEvent
    const forwardedBefore = feed.reconfigured.length
    feed.emit([hired])
    await vi.waitFor(() => expect(source.applied).toHaveLength(1))
    expect(source.applied[0]).toMatchObject({ kind: 'employee.upsert', employee: { id: 'emp_sim_new' } })
    expect(feed.reconfigured.length).toBe(forwardedBefore)

    // The same event again (e.g. a replayed batch) is not stored twice.
    feed.emit([hired])
    await Promise.resolve()
    expect(source.applied).toHaveLength(1)
  })
})

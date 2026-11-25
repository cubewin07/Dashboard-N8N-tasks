// AppearanceStore over the `appearances` table and the `save_appearance` RPC (P09-T11).
// Reads are plain selects (staff-only RLS); writes go through the RPC, which does the role
// check and the optimistic version compare. A version conflict (P0001) is mapped to
// AppearanceConflictError carrying the stored look, so the editor can offer Tải lại / Ghi đè.
import { StrictAppearanceV1Schema, type AppearanceV1 } from '@/domain/appearance'
import {
  AppearanceConflictError,
  type AppearanceEntry,
  type AppearanceStore,
} from '@/ports/AppearanceStore'
import type { Db } from './client'
import type { Json } from './database.types'
import type { RealtimeHub } from './realtime'

interface Row {
  employee_id: string
  doc: unknown
  version: number
}

const COLUMNS = 'employee_id, doc, version'

function isConflict(error: { code?: string; message?: string }): boolean {
  return error.code === 'P0001' || /version_conflict/.test(error.message ?? '')
}

export class SupabaseAppearanceStore implements AppearanceStore {
  private readonly listeners = new Set<(employeeId: string, doc: AppearanceV1) => void>()
  private known = new Map<string, number>()
  private closeChannel: (() => void) | null = null
  private unregisterReload: (() => void) | null = null

  constructor(
    private readonly db: Db,
    private readonly hub: RealtimeHub,
    private readonly warn: (msg: string, detail?: unknown) => void = (m, d) => console.warn(m, d),
  ) {}

  private parse(row: Row): AppearanceEntry | null {
    const res = StrictAppearanceV1Schema.safeParse(row.doc)
    if (!res.success) {
      this.warn(`[SupabaseAppearanceStore] skipped invalid look for "${row.employee_id}"`, res.error.issues)
      return null
    }
    return { doc: res.data, version: row.version }
  }

  async get(employeeId: string): Promise<AppearanceV1 | null> {
    return (await this.readOne(employeeId))?.doc ?? null
  }

  async getAll(): Promise<Record<string, AppearanceV1>> {
    const entries = await this.getEntries()
    return Object.fromEntries(Object.entries(entries).map(([id, e]) => [id, e.doc]))
  }

  async getEntries(): Promise<Record<string, AppearanceEntry>> {
    const { data, error } = await this.db.from('appearances').select(COLUMNS)
    if (error) throw new Error(error.message)
    const out: Record<string, AppearanceEntry> = {}
    for (const row of (data ?? []) as Row[]) {
      const entry = this.parse(row)
      if (entry) out[row.employee_id] = entry
    }
    return out
  }

  async save(
    employeeId: string,
    doc: AppearanceV1,
    expectedVersion: number,
  ): Promise<{ version: number }> {
    const valid = StrictAppearanceV1Schema.parse(doc)
    const { data, error } = await this.db.rpc('save_appearance', {
      p_employee_id: employeeId,
      p_doc: valid as unknown as Json,
      p_expected_version: expectedVersion,
    })
    if (error) {
      if (isConflict(error)) {
        const current = await this.readOne(employeeId)
        throw new AppearanceConflictError(
          employeeId,
          current?.doc ?? null,
          current?.version ?? 0,
          expectedVersion,
        )
      }
      throw new Error(error.message)
    }
    const version = Number(data)
    this.known.set(employeeId, version)
    return { version }
  }

  subscribe(cb: (employeeId: string, doc: AppearanceV1) => void): () => void {
    this.listeners.add(cb)
    if (this.listeners.size === 1) this.open()
    return () => {
      this.listeners.delete(cb)
      if (this.listeners.size === 0) this.close()
    }
  }

  private async readOne(employeeId: string): Promise<AppearanceEntry | null> {
    const { data, error } = await this.db
      .from('appearances')
      .select(COLUMNS)
      .eq('employee_id', employeeId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? this.parse(data as Row) : null
  }

  private open(): void {
    this.closeChannel = this.hub.openChannel(this.db, 'appearances', (ch) =>
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'appearances' }, (payload) => {
        const row = payload.new as Partial<Row> | undefined
        if (!row || typeof row.employee_id !== 'string' || typeof row.version !== 'number') return
        this.accept(row as Row)
      }),
    )
    this.unregisterReload = this.hub.registerReload(() => void this.reload())
    void this.reload(false)
  }

  private close(): void {
    this.closeChannel?.()
    this.unregisterReload?.()
    this.closeChannel = null
    this.unregisterReload = null
  }

  /** Emit a row when its version is newer than what this store already reported. */
  private accept(row: Row): void {
    if ((this.known.get(row.employee_id) ?? 0) >= row.version) return
    const entry = this.parse(row)
    if (!entry) return
    this.known.set(row.employee_id, row.version)
    for (const cb of [...this.listeners]) cb(row.employee_id, entry.doc)
  }

  /** After a reconnect (or on first open, silently): refetch everything and emit what changed. */
  private async reload(emit = true): Promise<void> {
    try {
      const entries = await this.getEntries()
      for (const [id, e] of Object.entries(entries)) {
        if (!emit) {
          this.known.set(id, Math.max(this.known.get(id) ?? 0, e.version))
          continue
        }
        this.accept({ employee_id: id, doc: e.doc, version: e.version })
      }
    } catch {
      /* the next reconnect retries */
    }
  }
}

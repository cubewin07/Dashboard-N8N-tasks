import { StrictAppearanceV1Schema, type AppearanceV1 } from '@/domain/appearance'
import {
  AppearanceConflictError,
  type AppearanceEntry,
  type AppearanceStore,
} from '@/ports/AppearanceStore'
import { migrateAppearance } from '@/scene/characters/appearance'

export const APPEARANCE_STORAGE_KEY = 'aioffice.appearance.v1'

interface StorageEnvelope {
  schema: 1
  items: Record<string, { doc: unknown; version: number }>
}

export interface LocalAppearanceStoreOptions {
  /** Defaults to `window.localStorage`; inject a fake in tests. */
  storage?: Storage
  /** Where `storage` events arrive (defaults to `window`). */
  eventTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
  key?: string
  warn?: (msg: string) => void
}

function emptyEnvelope(): StorageEnvelope {
  return { schema: 1, items: {} }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Looks saved in this browser only (until P09 swaps in Supabase). Versioned per employee;
 * a second tab's save arrives through the `storage` event.
 */
export class LocalAppearanceStore implements AppearanceStore {
  private readonly storage: Storage
  private readonly key: string
  private readonly warn: (msg: string) => void
  private readonly listeners = new Set<(employeeId: string, doc: AppearanceV1) => void>()
  private readonly eventTarget: LocalAppearanceStoreOptions['eventTarget']
  private lastSeen = new Map<string, number>()
  private listening = false

  constructor(options: LocalAppearanceStoreOptions = {}) {
    this.storage = options.storage ?? window.localStorage
    this.key = options.key ?? APPEARANCE_STORAGE_KEY
    this.warn = options.warn ?? (() => {})
    this.eventTarget = options.eventTarget ?? (typeof window !== 'undefined' ? window : undefined)
  }

  /** Synchronous read of every valid entry (docs migrated to the canonical shape). */
  readEntries(): Record<string, AppearanceEntry> {
    const env = this.readEnvelope()
    const out: Record<string, AppearanceEntry> = {}
    for (const [id, entry] of Object.entries(env.items)) {
      out[id] = {
        doc: migrateAppearance(entry.doc, undefined, this.warn),
        version: entry.version,
      }
    }
    return out
  }

  async get(employeeId: string): Promise<AppearanceV1 | null> {
    return this.readEntries()[employeeId]?.doc ?? null
  }

  async getAll(): Promise<Record<string, AppearanceV1>> {
    const out: Record<string, AppearanceV1> = {}
    for (const [id, entry] of Object.entries(this.readEntries())) out[id] = entry.doc
    return out
  }

  async getEntries(): Promise<Record<string, AppearanceEntry>> {
    return this.readEntries()
  }

  async save(
    employeeId: string,
    doc: AppearanceV1,
    expectedVersion: number,
  ): Promise<{ version: number }> {
    const valid = StrictAppearanceV1Schema.parse(doc)
    const env = this.readEnvelope()
    const current = env.items[employeeId]
    const currentVersion = current?.version ?? 0
    if (currentVersion !== expectedVersion) {
      throw new AppearanceConflictError(
        employeeId,
        current ? migrateAppearance(current.doc, undefined, this.warn) : null,
        currentVersion,
        expectedVersion,
      )
    }
    const version = currentVersion + 1
    env.items[employeeId] = { doc: valid, version }
    this.storage.setItem(this.key, JSON.stringify(env))
    this.lastSeen.set(employeeId, version)
    this.emit(employeeId, valid)
    return { version }
  }

  subscribe(cb: (employeeId: string, doc: AppearanceV1) => void): () => void {
    this.listeners.add(cb)
    if (!this.listening) {
      this.lastSeen = new Map(
        Object.entries(this.readEnvelope().items).map(([id, e]) => [id, e.version]),
      )
      this.eventTarget?.addEventListener('storage', this.onStorage as EventListener)
      this.listening = true
    }
    return () => {
      this.listeners.delete(cb)
      if (this.listeners.size === 0 && this.listening) {
        this.eventTarget?.removeEventListener('storage', this.onStorage as EventListener)
        this.listening = false
      }
    }
  }

  private emit(employeeId: string, doc: AppearanceV1): void {
    for (const cb of [...this.listeners]) cb(employeeId, doc)
  }

  private readonly onStorage = (e: { key?: string | null }): void => {
    if (e.key !== null && e.key !== undefined && e.key !== this.key) return
    const entries = this.readEntries()
    for (const [id, entry] of Object.entries(entries)) {
      if (this.lastSeen.get(id) === entry.version) continue
      this.lastSeen.set(id, entry.version)
      this.emit(id, entry.doc)
    }
  }

  private readEnvelope(): StorageEnvelope {
    let raw: string | null
    try {
      raw = this.storage.getItem(this.key)
    } catch {
      return emptyEnvelope()
    }
    if (raw === null) return emptyEnvelope()
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return this.recover(raw)
    }
    if (!isRecord(parsed) || parsed.schema !== 1 || !isRecord(parsed.items)) {
      return this.recover(raw)
    }
    const items: StorageEnvelope['items'] = {}
    for (const [id, entry] of Object.entries(parsed.items)) {
      if (
        isRecord(entry) &&
        typeof entry.version === 'number' &&
        Number.isInteger(entry.version) &&
        entry.version >= 1 &&
        isRecord(entry.doc)
      ) {
        items[id] = { doc: entry.doc, version: entry.version }
      }
    }
    return { schema: 1, items }
  }

  /** Corrupt data: keep the raw text under `<key>.backup-<n>` and start empty. */
  private recover(raw: string): StorageEnvelope {
    let n = 1
    try {
      while (this.storage.getItem(`${this.key}.backup-${n}`) !== null) n += 1
      this.storage.setItem(`${this.key}.backup-${n}`, raw)
      this.storage.setItem(this.key, JSON.stringify(emptyEnvelope()))
    } catch {
      // Storage unavailable or full: continue with an empty in-memory view.
    }
    this.warn(`[LocalAppearanceStore] corrupt data backed up as backup-${n}`)
    return emptyEnvelope()
  }
}

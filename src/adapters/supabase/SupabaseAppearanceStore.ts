// STUB (P09-T11 replaces it): AppearanceStore over the appearances table + save_appearance RPC.
import type { AppearanceV1 } from '@/domain/appearance'
import type { AppearanceEntry, AppearanceStore } from '@/ports/AppearanceStore'
import type { Db } from './client'
import type { RealtimeHub } from './realtime'

export class SupabaseAppearanceStore implements AppearanceStore {
  constructor(
    private readonly db: Db,
    private readonly hub: RealtimeHub,
  ) {}
  async get(): Promise<AppearanceV1 | null> {
    void this.db
    void this.hub
    return null
  }
  async getAll(): Promise<Record<string, AppearanceV1>> {
    return {}
  }
  async getEntries(): Promise<Record<string, AppearanceEntry>> {
    return {}
  }
  async save(): Promise<{ version: number }> {
    throw new Error('not implemented')
  }
  subscribe(_cb: (employeeId: string, doc: AppearanceV1) => void): () => void {
    void _cb
    return () => {}
  }
}

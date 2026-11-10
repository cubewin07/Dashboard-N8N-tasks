import type { AppearanceV1 } from '@/domain/appearance'

export interface AppearanceStore {
  get(employeeId: string): Promise<AppearanceV1 | null>
  getAll(): Promise<Record<string, AppearanceV1>>
  save(
    employeeId: string,
    doc: AppearanceV1,
    expectedVersion: number,
  ): Promise<{ version: number }>
  subscribe(cb: (employeeId: string, doc: AppearanceV1) => void): () => void
}

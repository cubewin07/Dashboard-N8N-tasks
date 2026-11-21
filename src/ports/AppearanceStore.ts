import type { AppearanceV1 } from '@/domain/appearance'

/** A saved look and its per-employee version (0 = never saved). */
export interface AppearanceEntry {
  doc: AppearanceV1
  version: number
}

export interface AppearanceStore {
  get(employeeId: string): Promise<AppearanceV1 | null>
  getAll(): Promise<Record<string, AppearanceV1>>
  /** Saved looks with their versions (needed for optimistic concurrency in the editor). */
  getEntries(): Promise<Record<string, AppearanceEntry>>
  /**
   * Optimistic save: succeeds only when `expectedVersion` equals the stored version
   * (an unknown employee is version 0). Otherwise rejects with `AppearanceConflictError`.
   */
  save(
    employeeId: string,
    doc: AppearanceV1,
    expectedVersion: number,
  ): Promise<{ version: number }>
  subscribe(cb: (employeeId: string, doc: AppearanceV1) => void): () => void
}

/** Thrown by `save` when the stored version differs from `expectedVersion`. */
export class AppearanceConflictError extends Error {
  readonly employeeId: string
  /** The look currently stored (null when none). */
  readonly current: AppearanceV1 | null
  readonly currentVersion: number
  readonly expectedVersion: number

  constructor(
    employeeId: string,
    current: AppearanceV1 | null,
    currentVersion: number,
    expectedVersion: number,
  ) {
    super(
      `Appearance conflict for "${employeeId}": expected v${expectedVersion}, stored v${currentVersion}`,
    )
    this.name = 'AppearanceConflictError'
    this.employeeId = employeeId
    this.current = current
    this.currentVersion = currentVersion
    this.expectedVersion = expectedVersion
  }
}

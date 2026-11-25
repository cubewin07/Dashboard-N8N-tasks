import { useMemo } from 'react'
import { create } from 'zustand'
import { LocalAppearanceStore, type LocalAppearanceStoreOptions } from '@/adapters/local/LocalAppearanceStore'
import { isSupabaseConfigured } from '@/adapters/supabase'
import type { AppearanceV1 } from '@/domain/appearance'
import { hashAppearance } from '@/scene/characters/appearance'
import { generateAppearance } from '@/scene/characters/generate'
import type { AppearanceEntry, AppearanceStore } from '@/ports/AppearanceStore'

import { AppearanceConflictError } from '@/ports/AppearanceStore'
export { AppearanceConflictError }

/** True when the app runs on the Supabase backend (R9). UI uses this instead of touching adapters. */
export function isBackendConfigured(): boolean {
  return isSupabaseConfigured()
}

export interface AppearanceCacheState {
  /** Saved looks by employee id (generated defaults are NOT stored here). */
  docs: Readonly<Record<string, AppearanceV1>>
  versions: Readonly<Record<string, number>>
}

/** Cache of saved looks; the only thing UI and 3D read. */
export const useAppearanceCache = create<AppearanceCacheState>(() => ({
  docs: {},
  versions: {},
}))

let activeStore: AppearanceStore | null = null
let unsubscribe: (() => void) | null = null

/** Keep the object identity when the look is unchanged (no needless re-assembly downstream). */
function sameIdentity(existing: AppearanceV1 | undefined, next: AppearanceV1): AppearanceV1 {
  return existing && hashAppearance(existing) === hashAppearance(next) ? existing : next
}

function applyEntries(entries: Record<string, AppearanceEntry>): void {
  useAppearanceCache.setState((s) => {
    const docs = { ...s.docs }
    const versions = { ...s.versions }
    for (const [id, e] of Object.entries(entries)) {
      const prev = s.versions[id]
      if (prev === e.version && s.docs[id]) continue
      docs[id] = sameIdentity(s.docs[id], e.doc)
      versions[id] = e.version
    }
    return { docs, versions }
  })
}

/** Swap the backing store (P09 swaps in Supabase; tests inject a fake) and reload the cache. */
export function setAppearanceStore(store: AppearanceStore): void {
  unsubscribe?.()
  activeStore = store
  useAppearanceCache.setState({ docs: {}, versions: {} })
  if (store instanceof LocalAppearanceStore) applyEntries(store.readEntries())
  void store
    .getEntries()
    .then((entries) => {
      if (activeStore === store) applyEntries(entries)
    })
    .catch((err: unknown) => console.warn('Loading saved looks failed:', err))
  unsubscribe = store.subscribe((id, doc) => {
    // Show the new look at once, then pick up the stored version.
    useAppearanceCache.setState((s) => ({ docs: { ...s.docs, [id]: sameIdentity(s.docs[id], doc) } }))
    void store
      .getEntries()
      .then((entries) => {
        if (activeStore === store) applyEntries(entries)
      })
      .catch((err: unknown) => console.warn('Reloading saved looks failed:', err))
  })
}

/** Use a fresh browser-local store with the given storage (tests, or a custom Storage). */
export function configureLocalAppearanceStore(options?: LocalAppearanceStoreOptions): void {
  setAppearanceStore(new LocalAppearanceStore(options))
}

function getStore(): AppearanceStore {
  if (!activeStore) {
    setAppearanceStore(new LocalAppearanceStore())
  }
  return activeStore as AppearanceStore
}

/** Make sure the registry exists (idempotent). */
export function initAppearanceStore(): void {
  getStore()
}

/**
 * Save a look. Resolves with the new version; rejects with `AppearanceConflictError`
 * when another tab saved first (the cache then already holds the newer look).
 */
export async function saveAppearance(
  employeeId: string,
  doc: AppearanceV1,
  expectedVersion: number,
): Promise<{ version: number }> {
  const store = getStore()
  const res = await store.save(employeeId, doc, expectedVersion)
  useAppearanceCache.setState((s) => ({
    docs: { ...s.docs, [employeeId]: sameIdentity(s.docs[employeeId], doc) },
    versions: { ...s.versions, [employeeId]: res.version },
  }))
  return res
}

const generatedCache = new Map<string, AppearanceV1>()

/** The deterministic default look for an employee; the same object each call (stable identity). */
export function getGeneratedAppearance(employeeId: string, name?: string): AppearanceV1 {
  const key = `${employeeId}\u0000${name ?? ''}`
  let doc = generatedCache.get(key)
  if (!doc) {
    doc = generateAppearance(employeeId, undefined, name ? { name } : undefined)
    generatedCache.set(key, doc)
  }
  return doc
}

/** Saved look or null (no generated fallback). */
export function useSavedAppearance(employeeId: string): AppearanceV1 | null {
  getStore()
  return useAppearanceCache((s) => s.docs[employeeId] ?? null)
}

/** Saved look, falling back to the generated default. Identity changes only when the look does. */
export function useAppearance(employeeId: string, name?: string): AppearanceV1 {
  const saved = useSavedAppearance(employeeId)
  return useMemo(
    () => saved ?? getGeneratedAppearance(employeeId, name),
    [saved, employeeId, name],
  )
}

/** Saved version of an employee's look (0 = never saved). */
export function useAppearanceVersion(employeeId: string): number {
  getStore()
  return useAppearanceCache((s) => s.versions[employeeId] ?? 0)
}

export type ImportStatus = 'imported' | 'exists' | 'failed'

export interface ImportResult {
  employeeId: string
  status: ImportStatus
}

/**
 * R14: copy looks saved in this browser's localStorage into the active store, once.
 * Each goes in with expected version 0, so an employee that already has a stored look is
 * reported as 'exists' and never overwritten.
 */
export async function importLocalLooks(
  local: { readEntries(): Record<string, AppearanceEntry> } = new LocalAppearanceStore(),
): Promise<ImportResult[]> {
  const results: ImportResult[] = []
  for (const [employeeId, entry] of Object.entries(local.readEntries())) {
    try {
      await saveAppearance(employeeId, entry.doc, 0)
      results.push({ employeeId, status: 'imported' })
    } catch (err) {
      results.push({ employeeId, status: err instanceof AppearanceConflictError ? 'exists' : 'failed' })
    }
  }
  return results
}

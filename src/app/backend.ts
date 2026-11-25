// Backend bootstrap (P09-T08/R9): with Supabase configured, load the adapters BEFORE the first
// render and install them. Without it nothing happens and the Local adapters stay.
// Only `@/adapters/supabase` (index.ts) is imported here; supabase-js arrives via a dynamic chunk.
import { isSupabaseConfigured, loadSupabaseAdapters } from '@/adapters/supabase'
import { setBackendRealtime } from '@/office/backendConnection'
import { setAppearanceStore } from '@/office/appearanceStore'
import { setConfigSource } from '@/office/configStore'
import { installAuthPort } from './authRegistry'

/** True when Supabase env is present (R9): the app must boot the backend before rendering. */
export function backendRequired(): boolean {
  return isSupabaseConfigured()
}

let installed = false

export async function bootBackend(): Promise<void> {
  if (!isSupabaseConfigured() || installed) return
  const adapters = await loadSupabaseAdapters()
  installAuthPort(adapters.auth)
  setConfigSource(adapters.config)
  setAppearanceStore(adapters.appearance)
  setBackendRealtime(adapters.realtime)
  installed = true
}

// Backend bootstrap (P09-T08/R9): with Supabase configured, load the adapters BEFORE the first
// render and install them. Without it nothing happens and the Local adapters stay.
// Only `@/adapters/supabase` (index.ts) is imported here; supabase-js arrives via a dynamic chunk.
import { isSupabaseConfigured, loadSupabaseAdapters } from '@/adapters/supabase'
import { setBackendRealtime } from '@/office/backendConnection'
import { setAppearanceStore } from '@/office/appearanceStore'
import { setConfigSource } from '@/office/configStore'
import type { AppearanceStore } from '@/ports/AppearanceStore'
import { AuthError, type Session } from '@/ports/AuthPort'
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
  setBackendRealtime(adapters.realtime)
  // Appearances are readable only by a signed-in staff user (RLS). Install the Supabase store
  // per signed-in user (re-installing reloads the cache and re-opens the channel with the new
  // token) and an empty store while signed out, so a visitor never queries the API.
  let currentUserId: string | null | undefined
  const syncSession = (session: Session | null) => {
    const userId = session?.userId ?? null
    if (userId === currentUserId) return
    currentUserId = userId
    setAppearanceStore(userId ? adapters.appearance : signedOutAppearanceStore)
  }
  syncSession(adapters.auth.session())
  adapters.auth.onChange(syncSession)
  installed = true
}

/** Holds nothing and writes nothing: the appearance store while nobody is signed in. */
const signedOutAppearanceStore: AppearanceStore = {
  get: async () => null,
  getAll: async () => ({}),
  getEntries: async () => ({}),
  save: async () => {
    throw new AuthError('not_allowed')
  },
  subscribe: () => () => {},
}

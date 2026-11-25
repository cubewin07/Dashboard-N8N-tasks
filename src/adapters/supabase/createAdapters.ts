// Builds the Supabase adapters. Loaded only through `loadSupabaseAdapters()` (dynamic import),
// so supabase-js stays out of the initial chunk when Supabase is not configured.
import { getClient } from './client'
import type { SupabaseAdapters } from './index'
import { RealtimeHub } from './realtime'
import { SupabaseAppearanceStore } from './SupabaseAppearanceStore'
import { SupabaseAuth } from './SupabaseAuth'
import { SupabaseConfigSource } from './SupabaseConfigSource'

export async function createSupabaseAdapters(): Promise<SupabaseAdapters> {
  const db = getClient()
  const realtime = new RealtimeHub()
  const auth = new SupabaseAuth(db)
  // Restore the stored session (and its app_users row) before the app renders,
  // so AuthPort.session() can stay synchronous.
  await auth.ready()
  return {
    auth,
    config: new SupabaseConfigSource(db, realtime),
    appearance: new SupabaseAppearanceStore(db, realtime),
    realtime,
  }
}

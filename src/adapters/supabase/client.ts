// The one supabase-js client. Only files under src/adapters/supabase/ import supabase-js (R8),
// and only through the dynamic `loadSupabaseAdapters()` chain, never from the eager index.ts.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { supabaseEnv } from './index'

export type Db = SupabaseClient<Database>

let client: Db | null = null

export function getClient(): Db {
  if (client) return client
  const env = supabaseEnv()
  if (!env) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)')
  client = createClient<Database>(env.url, env.anonKey, {
    // The Supabase session lives in localStorage (supabase-js default). That is allowed;
    // the Drive token rule (memory only) is separate and unchanged.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return client
}

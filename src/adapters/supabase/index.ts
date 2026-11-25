// Supabase adapter entry (P09). This file must stay free of `@supabase/supabase-js` imports:
// it is imported eagerly by the registries, and supabase-js must not land in the initial chunk
// when no Supabase env is set (P09-T08). Everything heavy is behind `loadSupabaseAdapters()`.
import type { AppearanceStore } from '@/ports/AppearanceStore'
import type { AuthPort } from '@/ports/AuthPort'
import type { ConfigSource } from '@/ports/ConfigSource'
import type { ConnectionState } from '@/ports/OfficeFeed'

/** Public values only (R10). Read once; Vite inlines them at build time. */
export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''
  return url && anonKey ? { url, anonKey } : null
}

/** R9: both env values present → Supabase adapters; otherwise Local adapters. */
export function isSupabaseConfigured(): boolean {
  return supabaseEnv() !== null
}

/** Realtime connection of the Supabase adapters, for LiveBadge (worst of feed + this). */
export interface RealtimeStatus {
  connection(): ConnectionState
  onConnection(cb: (c: ConnectionState) => void): () => void
}

export interface SupabaseAdapters {
  auth: AuthPort
  config: ConfigSource
  appearance: AppearanceStore
  realtime: RealtimeStatus
}

let pending: Promise<SupabaseAdapters> | null = null

/** Loads supabase-js and builds the adapters once (dynamic import → separate chunk). */
export function loadSupabaseAdapters(): Promise<SupabaseAdapters> {
  pending ??= import('./createAdapters').then((m) => m.createSupabaseAdapters())
  return pending
}

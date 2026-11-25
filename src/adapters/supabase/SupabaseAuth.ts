// STUB (P09-T09 replaces it): AuthPort over Supabase Auth + app_users.
import type { AuthPort, Session } from '@/ports/AuthPort'
import type { Db } from './client'

export class SupabaseAuth implements AuthPort {
  constructor(private readonly db: Db) {}
  async ready(): Promise<void> {}
  session(): Session | null {
    return null
  }
  onChange(_cb: (s: Session | null) => void): () => void {
    void _cb
    return () => {}
  }
  async signIn(): Promise<void> {
    void this.db
    throw new Error('not implemented')
  }
  async signOut(): Promise<void> {}
  async sendPasswordReset(): Promise<void> {
    throw new Error('not implemented')
  }
}

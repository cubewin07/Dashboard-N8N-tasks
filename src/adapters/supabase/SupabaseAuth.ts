// AuthPort over Supabase Auth + the app_users table (P09-T09).
// session() is synchronous: ready() restores the stored session (joined with its app_users row)
// before the first render, and onAuthStateChange keeps it current (other tabs, token refresh).
import { AuthError, type AuthPort, type Session } from '@/ports/AuthPort'
import type { Db } from './client'

interface AppUserRow {
  role: 'boss' | 'stylist'
  display_name: string
}

interface AuthUserLike {
  id: string
  email?: string | null
}

function isNetworkError(err: { name?: string; status?: number }): boolean {
  return (
    err.name === 'AuthRetryableFetchError' ||
    err.status === 0 ||
    (typeof err.status === 'number' && err.status >= 500)
  )
}

/** Where the reset email sends the user back to: this app's reset page (HashRouter). */
export function resetRedirectUrl(): string {
  const base = (import.meta.env.BASE_URL as string | undefined) ?? '/'
  return `${window.location.origin}${base}#/reset-password`
}

export class SupabaseAuth implements AuthPort {
  private current: Session | null = null
  private readonly listeners = new Set<(s: Session | null) => void>()
  private watching = false

  constructor(private readonly db: Db) {}

  /** Restore the stored session. Rejects when the app_users lookup fails (e.g. offline). */
  async ready(): Promise<void> {
    const { data } = await this.db.auth.getSession()
    const user = data.session?.user ?? null
    if (user) {
      const session = await this.lookup(user)
      if (!session) await this.db.auth.signOut() // signed in but not an app user
      this.current = session
    }
    this.watch()
  }

  session(): Session | null {
    return this.current
  }

  onChange(cb: (s: Session | null) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.db.auth.signInWithPassword({ email, password })
    if (error) throw new AuthError(isNetworkError(error) ? 'network' : 'invalid_credentials')
    let session: Session | null
    try {
      session = await this.lookup(data.user)
    } catch {
      await this.db.auth.signOut()
      throw new AuthError('network')
    }
    if (!session) {
      await this.db.auth.signOut()
      throw new AuthError('not_allowed')
    }
    this.set(session)
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut()
    this.set(null)
  }

  async sendPasswordReset(email: string): Promise<void> {
    const { error } = await this.db.auth.resetPasswordForEmail(email, {
      redirectTo: resetRedirectUrl(),
    })
    if (error) throw new AuthError(isNetworkError(error) ? 'network' : 'unknown')
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.db.auth.updateUser({ password })
    if (error) throw new AuthError(isNetworkError(error) ? 'network' : 'unknown', error.message)
  }

  private watch(): void {
    if (this.watching) return
    this.watching = true
    this.db.auth.onAuthStateChange((event, authSession) => {
      if (event === 'PASSWORD_RECOVERY') window.location.hash = '#/reset-password'
      if (event === 'INITIAL_SESSION') return // handled by ready()
      // Never call supabase from inside this callback (it holds an auth lock): defer.
      setTimeout(() => void this.sync(event, authSession?.user ?? null), 0)
    })
  }

  private async sync(event: string, user: AuthUserLike | null): Promise<void> {
    if (!user) {
      if (event === 'SIGNED_OUT') this.set(null)
      return
    }
    if (this.current?.userId === user.id && event !== 'USER_UPDATED') return
    try {
      const session = await this.lookup(user)
      if (session) this.set(session)
      else {
        await this.db.auth.signOut()
        this.set(null)
      }
    } catch {
      /* keep the current session; the next event retries */
    }
  }

  private async lookup(user: AuthUserLike): Promise<Session | null> {
    const { data, error } = await this.db
      .from('app_users')
      .select('role, display_name')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const row = data as AppUserRow
    return {
      userId: user.id,
      email: user.email ?? '',
      role: row.role,
      displayName: row.display_name,
    }
  }

  private set(session: Session | null): void {
    const same =
      this.current?.userId === session?.userId &&
      this.current?.role === session?.role &&
      this.current?.displayName === session?.displayName
    this.current = session
    if (same) return
    for (const cb of [...this.listeners]) cb(session)
  }
}

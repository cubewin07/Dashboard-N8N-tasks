// The ONE place that picks the AuthPort implementation: LocalAuth (demo accounts) when Supabase is
// not configured, SupabaseAuth (installed by the bootstrap before the first render) when it is.
import { DEMO_ACCOUNT_EMAILS as LOCAL_DEMO_EMAILS, LocalAuth } from '@/adapters/local/LocalAuth'
import { isSupabaseConfigured } from '@/adapters/supabase'
import type { AuthPort, Session } from '@/ports/AuthPort'

/** Local demo accounts exist only without Supabase. */
export const DEMO_ACCOUNT_EMAILS: string[] = isSupabaseConfigured() ? [] : LOCAL_DEMO_EMAILS

/** Forwards to the installed port, so importers can hold one stable reference. */
class LateBoundAuth implements AuthPort {
  private inner: AuthPort | null
  private unsubscribeInner: (() => void) | null = null
  private readonly listeners = new Set<(s: Session | null) => void>()

  constructor(initial: AuthPort | null) {
    this.inner = initial
    this.bind()
  }

  install(port: AuthPort): void {
    this.unsubscribeInner?.()
    this.inner = port
    this.bind()
    for (const cb of [...this.listeners]) cb(port.session())
  }

  private bind(): void {
    this.unsubscribeInner =
      this.inner?.onChange((s) => {
        for (const cb of [...this.listeners]) cb(s)
      }) ?? null
  }

  session(): Session | null {
    return this.inner?.session() ?? null
  }
  onChange(cb: (s: Session | null) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }
  private port(): AuthPort {
    if (!this.inner) throw new Error('Auth backend is not ready')
    return this.inner
  }
  signIn(email: string, password: string): Promise<void> {
    return this.port().signIn(email, password)
  }
  signOut(): Promise<void> {
    return this.port().signOut()
  }
  sendPasswordReset(email: string): Promise<void> {
    return this.port().sendPasswordReset(email)
  }
  updatePassword(password: string): Promise<void> {
    const port = this.port()
    if (!port.updatePassword) return Promise.reject(new Error('updatePassword not supported'))
    return port.updatePassword(password)
  }
  get canUpdatePassword(): boolean {
    return Boolean(this.inner?.updatePassword)
  }
}

const lateBound = new LateBoundAuth(isSupabaseConfigured() ? null : new LocalAuth())

export const authPort: AuthPort = lateBound

/** Called by the bootstrap (before the first render) with the Supabase auth port. */
export function installAuthPort(port: AuthPort): void {
  lateBound.install(port)
}

/** True when the active port can set a real new password (Supabase). */
export function canUpdatePassword(): boolean {
  return lateBound.canUpdatePassword
}

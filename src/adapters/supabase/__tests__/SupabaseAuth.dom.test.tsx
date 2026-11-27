import { describe, expect, it, vi } from 'vitest'
import { AuthError } from '@/ports/AuthPort'
import type { Db } from '../client'
import { SupabaseAuth } from '../SupabaseAuth'

type AuthCb = (event: string, session: { user: { id: string; email: string } } | null) => void

function makeDb(opts: {
  stored?: { id: string; email: string } | null
  appUser?: { role: 'boss' | 'stylist'; display_name: string } | null
  signInError?: { name?: string; status?: number } | null
  lookupError?: boolean
}) {
  let cb: AuthCb | null = null
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: opts.stored ? { user: opts.stored } : null } })),
    signInWithPassword: vi.fn(async ({ email }: { email: string }) =>
      opts.signInError
        ? { data: { user: null }, error: opts.signInError }
        : { data: { user: { id: 'u1', email } }, error: null },
    ),
    signOut: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn((fn: AuthCb) => {
      cb = fn
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }),
  }
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () =>
          opts.lookupError
            ? { data: null, error: { message: 'fetch failed' } }
            : { data: opts.appUser ?? null, error: null },
      }),
    }),
  }))
  const db = { auth, from } as unknown as Db
  return { db, auth, emit: (e: string, s: Parameters<AuthCb>[1]) => cb?.(e, s) }
}

describe('SupabaseAuth', () => {
  it('restores a stored session joined with app_users', async () => {
    const { db } = makeDb({ stored: { id: 'u1', email: 'a@x.vn' }, appUser: { role: 'stylist', display_name: 'Lan' } })
    const auth = new SupabaseAuth(db)
    await auth.ready()
    expect(auth.session()).toEqual({ userId: 'u1', email: 'a@x.vn', role: 'stylist', displayName: 'Lan' })
  })

  it('has no session when nothing is stored', async () => {
    const { db } = makeDb({})
    const auth = new SupabaseAuth(db)
    await auth.ready()
    expect(auth.session()).toBeNull()
  })

  it('signs a stored user without an app_users row out', async () => {
    const { db, auth: raw } = makeDb({ stored: { id: 'u1', email: 'a@x.vn' }, appUser: null })
    const auth = new SupabaseAuth(db)
    await auth.ready()
    expect(auth.session()).toBeNull()
    expect(raw.signOut).toHaveBeenCalled()
  })

  it('rejects ready() when the lookup fails (offline) without signing out', async () => {
    const { db, auth: raw } = makeDb({ stored: { id: 'u1', email: 'a@x.vn' }, lookupError: true })
    await expect(new SupabaseAuth(db).ready()).rejects.toThrow()
    expect(raw.signOut).not.toHaveBeenCalled()
  })

  it('signIn sets the session and notifies', async () => {
    const { db } = makeDb({ appUser: { role: 'boss', display_name: 'Sếp' } })
    const auth = new SupabaseAuth(db)
    const seen: Array<string | undefined> = []
    auth.onChange((s) => seen.push(s?.role))
    await auth.signIn('b@x.vn', 'secret1')
    expect(auth.session()?.role).toBe('boss')
    expect(seen).toEqual(['boss'])
  })

  it('wrong password maps to invalid_credentials', async () => {
    const { db } = makeDb({ signInError: { name: 'AuthApiError', status: 400 } })
    const err = await new SupabaseAuth(db).signIn('b@x.vn', 'x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AuthError)
    expect((err as AuthError).code).toBe('invalid_credentials')
  })

  it('a network failure maps to network', async () => {
    const { db } = makeDb({ signInError: { name: 'AuthRetryableFetchError', status: 0 } })
    const err = await new SupabaseAuth(db).signIn('b@x.vn', 'x').catch((e: unknown) => e)
    expect((err as AuthError).code).toBe('network')
  })

  it('a user without an app_users row is signed out and rejected with not_allowed', async () => {
    const { db, auth: raw } = makeDb({ appUser: null })
    const auth = new SupabaseAuth(db)
    const err = await auth.signIn('x@x.vn', 'secret1').catch((e: unknown) => e)
    expect((err as AuthError).code).toBe('not_allowed')
    expect(raw.signOut).toHaveBeenCalled()
    expect(auth.session()).toBeNull()
  })

  it('signOut clears the session', async () => {
    const { db } = makeDb({ appUser: { role: 'boss', display_name: 'S' } })
    const auth = new SupabaseAuth(db)
    await auth.signIn('b@x.vn', 'secret1')
    await auth.signOut()
    expect(auth.session()).toBeNull()
  })

  it('password reset redirects to the hash reset page', async () => {
    const { db, auth: raw } = makeDb({})
    await new SupabaseAuth(db).sendPasswordReset('b@x.vn')
    const [email, o] = raw.resetPasswordForEmail.mock.calls[0] as unknown as [string, { redirectTo: string }]
    expect(email).toBe('b@x.vn')
    expect(o.redirectTo.endsWith('#/reset-password')).toBe(true)
    expect(o.redirectTo.startsWith(window.location.origin)).toBe(true)
  })

  it('updatePassword calls updateUser', async () => {
    const { db, auth: raw } = makeDb({})
    await new SupabaseAuth(db).updatePassword('newpass1')
    expect(raw.updateUser).toHaveBeenCalledWith({ password: 'newpass1' })
  })

  it('follows sign-out and sign-in from another tab, and routes PASSWORD_RECOVERY', async () => {
    vi.useFakeTimers()
    try {
      const { db, emit } = makeDb({ stored: { id: 'u1', email: 'a@x.vn' }, appUser: { role: 'boss', display_name: 'S' } })
      const auth = new SupabaseAuth(db)
      await auth.ready()
      emit('SIGNED_OUT', null)
      await vi.runAllTimersAsync()
      expect(auth.session()).toBeNull()
      emit('SIGNED_IN', { user: { id: 'u1', email: 'a@x.vn' } })
      await vi.runAllTimersAsync()
      expect(auth.session()?.userId).toBe('u1')
      emit('PASSWORD_RECOVERY', { user: { id: 'u1', email: 'a@x.vn' } })
      expect(window.location.hash).toBe('#/reset-password')
    } finally {
      vi.useRealTimers()
    }
  })
})

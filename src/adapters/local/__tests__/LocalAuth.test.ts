// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalAuth, SESSION_KEY } from '../LocalAuth'

describe('LocalAuth', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('signs in as boss and stylist with the right role', async () => {
    const auth = new LocalAuth(0)
    await auth.signIn('boss@demo.local', 'secret1')
    expect(auth.session()?.role).toBe('boss')
    await auth.signIn('stylist@demo.local', 'secret1')
    expect(auth.session()).toMatchObject({ role: 'stylist', email: 'stylist@demo.local' })
  })

  it('rejects unknown email and short password with a generic error', async () => {
    const auth = new LocalAuth(0)
    await expect(auth.signIn('nobody@demo.local', 'secret1')).rejects.toThrow('invalid_credentials')
    await expect(auth.signIn('boss@demo.local', '123')).rejects.toThrow('invalid_credentials')
    expect(auth.session()).toBeNull()
  })

  it('notifies listeners on sign in and out, and stores only a demo flag', async () => {
    const auth = new LocalAuth(0)
    const cb = vi.fn()
    const off = auth.onChange(cb)
    await auth.signIn('boss@demo.local', 'secret1')
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}')).toEqual({
      email: 'boss@demo.local',
      demo: true,
    })
    await auth.signOut()
    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenLastCalledWith(null)
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
    off()
    await auth.signIn('boss@demo.local', 'secret1')
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('restores a stored session and drops the legacy key', () => {
    localStorage.setItem('shophq.demo-session', JSON.stringify({ email: 'a@b.co' }))
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: 'stylist@demo.local', demo: true }))
    const auth = new LocalAuth(0)
    expect(auth.session()?.role).toBe('stylist')
    expect(localStorage.getItem('shophq.demo-session')).toBeNull()
  })

  it('ignores a stored session for an unknown account', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: 'x@y.co' }))
    expect(new LocalAuth(0).session()).toBeNull()
  })

  it('syncs from the storage event of another tab', () => {
    const auth = new LocalAuth(0)
    const cb = vi.fn()
    auth.onChange(cb)
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: 'boss@demo.local', demo: true }))
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY }))
    expect(auth.session()?.role).toBe('boss')
    localStorage.removeItem(SESSION_KEY)
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY }))
    expect(auth.session()).toBeNull()
    expect(cb).toHaveBeenCalledTimes(2)
  })
})

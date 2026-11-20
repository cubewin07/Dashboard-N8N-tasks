// Demo AuthPort (R12): two accounts in code, any password of 6+ characters.
// The session in localStorage is a demo flag only, never a token.
import type { AuthPort, Session } from '@/ports/AuthPort'

export const SESSION_KEY = 'aioffice.session'
const LEGACY_KEY = 'shophq.demo-session'
const DELAY_MS = 600

const ACCOUNTS: Record<string, Session> = {
  'boss@demo.local': {
    userId: 'demo-boss',
    email: 'boss@demo.local',
    role: 'boss',
    displayName: 'Sếp',
  },
  'stylist@demo.local': {
    userId: 'demo-stylist',
    email: 'stylist@demo.local',
    role: 'stylist',
    displayName: 'Stylist',
  },
}

export const DEMO_ACCOUNT_EMAILS = Object.keys(ACCOUNTS)

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { email?: unknown }
    const email = typeof parsed.email === 'string' ? parsed.email : ''
    return ACCOUNTS[email] ?? null
  } catch {
    return null
  }
}

function sameSession(a: Session | null, b: Session | null): boolean {
  return a?.userId === b?.userId
}

export class LocalAuth implements AuthPort {
  private current: Session | null
  private listeners = new Set<(s: Session | null) => void>()
  private delayMs: number

  constructor(delayMs: number = DELAY_MS) {
    this.delayMs = delayMs
    try {
      // Old demo sessions carried no role: drop them once so they sign out cleanly.
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      /* ignore */
    }
    this.current = readSession()
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key !== null && e.key !== SESSION_KEY) return
        const next = readSession()
        if (sameSession(next, this.current)) return
        this.current = next
        this.emit()
      })
    }
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
    await new Promise((r) => setTimeout(r, this.delayMs))
    const account = ACCOUNTS[email.trim().toLowerCase()]
    if (!account || password.length < 6) throw new Error('invalid_credentials')
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ email: account.email, demo: true }))
    } catch {
      /* ignore */
    }
    this.current = account
    this.emit()
  }

  async signOut(): Promise<void> {
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
    this.current = null
    this.emit()
  }

  async sendPasswordReset(): Promise<void> {
    await new Promise((r) => setTimeout(r, this.delayMs))
  }

  private emit(): void {
    for (const cb of [...this.listeners]) cb(this.current)
  }
}

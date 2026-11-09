// MVP auth: demo-only, accepts any email + password (≥ 6 chars). Later: Supabase Auth (email + password).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

interface Session { email: string }
interface AuthValue {
  session: Session | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
  sendPasswordReset: (email: string) => Promise<void>
}
const AuthContext = createContext<AuthValue | null>(null)
const KEY = 'shophq.demo-session' // demo flag only, not a token

function load(): Session | null {
  try {
    const v = localStorage.getItem(KEY)
    return v ? (JSON.parse(v) as Session) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(load)
  const value = useMemo<AuthValue>(
    () => ({
      session,
      async signIn(email, password) {
        await new Promise((r) => setTimeout(r, 600))
        if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6) throw new Error('invalid_credentials')
        const s = { email }
        try {
          localStorage.setItem(KEY, JSON.stringify(s))
        } catch {
          /* ignore */
        }
        setSession(s)
      },
      signOut() {
        try {
          localStorage.removeItem(KEY)
        } catch {
          /* ignore */
        }
        setSession(null)
      },
      async sendPasswordReset() {
        await new Promise((r) => setTimeout(r, 600))
      },
    }),
    [session],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const location = useLocation()
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

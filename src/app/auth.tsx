// Auth context over the AuthPort (LocalAuth demo now, Supabase later). Role comes with the session.
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { AuthPort, Session } from '@/ports/AuthPort'
import { authPort } from './authRegistry'

interface AuthValue {
  session: Session | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
  sendPasswordReset: (email: string) => Promise<void>
}
const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children, port = authPort }: { children: ReactNode; port?: AuthPort }) {
  const session = useSyncExternalStore(
    (cb) => port.onChange(cb),
    () => port.session(),
  )
  const value = useMemo<AuthValue>(
    () => ({
      session,
      signIn: (email, password) => port.signIn(email, password),
      signOut: () => void port.signOut(),
      sendPasswordReset: (email) => port.sendPasswordReset(email),
    }),
    [session, port],
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

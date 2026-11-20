// Redirects a signed-in user away from routes their role may not open (R13).
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import { canAccessRoute, landingFor } from './roles'

export function RoleGuard({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const { pathname } = useLocation()
  if (session && !canAccessRoute(session.role, pathname)) {
    return <Navigate to={landingFor(session.role)} replace />
  }
  return <>{children}</>
}

/** Any path no route matches goes to the role's landing page. */
export function UnknownRoute() {
  const { session } = useAuth()
  return <Navigate to={session ? landingFor(session.role) : '/login'} replace />
}

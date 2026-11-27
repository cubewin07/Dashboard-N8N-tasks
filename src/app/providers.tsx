import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setConfigActorGetter } from '@/office/configStore'
import { setCommandsAllowed } from '@/office/sessionRole'
import { startOffice, stopOffice } from '@/office/store'
import { AuthProvider, useAuth } from './auth'
import { authPort } from './authRegistry'
import { can } from './roles'

// P11-T03: sonner (~10 KB gzip) stays out of the shell. Toasts only come from user actions
// on lazy routes, long after this has loaded.
const Toaster = lazy(() => import('sonner').then((m) => ({ default: m.Toaster })))

// Config writes are role-checked against whoever is signed in right now (R15).
setConfigActorGetter(() => {
  const s = authPort.session()
  return s ? { userId: s.userId, role: s.role, displayName: s.displayName } : null
})

function OfficeBootstrap({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const role = session?.role
  useEffect(() => {
    setCommandsAllowed(can(role, 'command'))
    // A stylist never boots the feed: no simulator, no office store.
    if (!can(role, 'office')) {
      stopOffice()
      return
    }
    startOffice()
  }, [role])
  return <>{children}</>
}

/** The language provider sits above, in `main.tsx`, so the backend gate shares it. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <OfficeBootstrap>
        <TooltipProvider delayDuration={300}>
          {children}
          <Suspense fallback={null}>
            <Toaster position="top-center" richColors />
          </Suspense>
        </TooltipProvider>
      </OfficeBootstrap>
    </AuthProvider>
  )
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { I18nProvider } from '@/i18n'
import { setCommandsAllowed } from '@/office/sessionRole'
import { startOffice, stopOffice } from '@/office/store'
import { AuthProvider, useAuth } from './auth'
import { DriveProvider } from './drive'
import { can } from './roles'
import { RealtimeProvider } from './RealtimeProvider'
import { StartWorkProvider } from './startWork'

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

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  )
  return (
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <AuthProvider>
          <OfficeBootstrap>
            <RealtimeProvider>
              <DriveProvider>
                <StartWorkProvider>
                  <TooltipProvider delayDuration={300}>
                    {children}
                    <Toaster position="top-center" richColors />
                  </TooltipProvider>
                </StartWorkProvider>
              </DriveProvider>
            </RealtimeProvider>
          </OfficeBootstrap>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  )
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { I18nProvider } from '@/i18n'
import { AuthProvider } from './auth'
import { DriveProvider } from './drive'
import { RealtimeProvider } from './RealtimeProvider'
import { StartWorkProvider } from './startWork'
import { TooltipProvider } from '@/components/ui/tooltip'

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } }))
  return (
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <AuthProvider>
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
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  )
}

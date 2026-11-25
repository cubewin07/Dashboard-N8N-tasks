// Holds the first render until the Supabase adapters are installed (R9). Without Supabase it
// renders the children at once (no flash, no async work).
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { backendRequired, bootBackend } from './backend'

type Phase = 'loading' | 'error' | 'ready'

export function BackendGate({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>(backendRequired() ? 'loading' : 'ready')

  const boot = useCallback(() => {
    bootBackend().then(
      () => setPhase('ready'),
      () => setPhase('error'),
    )
  }, [])

  useEffect(() => {
    if (backendRequired()) boot()
  }, [boot])

  const retry = () => {
    setPhase('loading')
    boot()
  }

  if (phase === 'ready') return <>{children}</>
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      {phase === 'loading' ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t.common.backend.loading}
        </p>
      ) : (
        <div role="alert" className="max-w-sm space-y-3">
          <h1 className="text-lg font-semibold">{t.common.backend.errorTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.common.backend.errorBody}</p>
          <Button variant="primary" onClick={retry}>
            {t.common.actions.retry}
          </Button>
        </div>
      )}
    </div>
  )
}

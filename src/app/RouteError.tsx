import { RotateCw } from 'lucide-react'
import { useEffect } from 'react'
import { useRouteError } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

/**
 * Shown instead of React Router's default English error screen: a lazy chunk
 * that no longer exists after a deploy, or a render error inside a route.
 */
export function RouteError() {
  const { t } = useI18n()
  const error = useRouteError()

  useEffect(() => {
    console.warn('Route error:', error)
  }, [error])

  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center animate-fade-in"
    >
      <h1 className="text-lg font-semibold text-foreground">{t.common.error.routeTitle}</h1>
      <p className="text-sm text-muted-foreground">{t.common.error.routeHint}</p>
      <Button onClick={() => window.location.reload()}>
        <RotateCw className="size-4" aria-hidden />
        <span>{t.common.error.reload}</span>
      </Button>
    </div>
  )
}

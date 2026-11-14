import { Box, List } from 'lucide-react'
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { useDeviceTierPreference } from '@/app/deviceTier'
import { PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { OrgList } from '@/features/org/OrgList'
import { useI18n } from '@/i18n'

const LazyOfficeCanvas = lazy(() => import('@/scene/OfficeCanvas'))

interface CanvasErrorBoundaryProps {
  fallback: ReactNode
  children: ReactNode
}

interface CanvasErrorBoundaryState {
  hasError: boolean
}

class CanvasErrorBoundary extends Component<
  CanvasErrorBoundaryProps,
  CanvasErrorBoundaryState
> {
  state: CanvasErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): CanvasErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('OfficeCanvas error boundary caught an error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

export function OfficePage() {
  const { t } = useI18n()
  const { tier, setOverride } = useDeviceTierPreference()

  if (tier === 'fallback') {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          title={t.office.title}
          description={t.office.subtitle}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOverride('full3d')}
            >
              <Box className="size-4" aria-hidden />
              <span>{t.office.view3dButton}</span>
            </Button>
          }
        />
        <OrgList compact />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title={t.office.title}
        description={t.office.subtitle}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOverride('fallback')}
          >
            <List className="size-4" aria-hidden />
            <span>{t.office.view2dButton}</span>
          </Button>
        }
      />

      <CanvasErrorBoundary
        fallback={
          <div className="space-y-4">
            <p
              role="status"
              className="rounded-xl border border-waiting/30 bg-waiting-soft px-4 py-3 text-xs text-waiting"
            >
              {t.office.canvasError}
            </p>
            <OrgList compact />
          </div>
        }
      >
        <Suspense
          fallback={
            <div
              aria-busy="true"
              aria-label={t.office.loadingCanvas}
              className="h-[calc(100dvh-11rem)] min-h-[420px] w-full"
            >
              <Skeleton className="h-full w-full rounded-[14px]" />
            </div>
          }
        >
          <LazyOfficeCanvas />
        </Suspense>
      </CanvasErrorBoundary>
    </div>
  )
}

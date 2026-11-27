import { List } from 'lucide-react'
import { Component, Fragment, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { hasWebGL2Support, useDeviceTierPreference } from '@/app/deviceTier'
import { PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { OrgList } from '@/features/org/OrgList'
import { OrgTabs } from '@/features/org/OrgTabs'
import { useI18n } from '@/i18n'
import { useOffice } from '@/office'
import { officeExtensions } from '@/office/extensions'
import { useDiagnostics } from '@/office/diagnostics'
import { View3dOptIn } from './View3dOptIn'

const LazyOfficeCanvas = lazy(() => import('@/scene/OfficeCanvas'))

interface CanvasErrorBoundaryProps {
  /** Rendered after the automatic retry failed too; `retry` remounts the canvas. */
  fallback: (retry: () => void) => ReactNode
  children: ReactNode
}

interface CanvasErrorBoundaryState {
  hasError: boolean
  attempt: number
}

/** P11 §3.5: one automatic retry, then the 2D list with a "Tải lại cảnh" button. */
export class CanvasErrorBoundary extends Component<CanvasErrorBoundaryProps, CanvasErrorBoundaryState> {
  state: CanvasErrorBoundaryState = { hasError: false, attempt: 0 }
  private autoRetried = false

  static getDerivedStateFromError(): Partial<CanvasErrorBoundaryState> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('OfficeCanvas error boundary caught an error:', error, info)
    useDiagnostics.getState().record('canvas_error', error.message || String(error))
    if (!this.autoRetried) {
      this.autoRetried = true
      this.retry()
    }
  }

  retry = () => {
    this.setState((s) => ({ hasError: false, attempt: s.attempt + 1 }))
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback(this.retry)
    }
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
  }
}

export function OfficePage() {
  const { t } = useI18n()
  const { tier, setOverride } = useDeviceTierPreference()
  useOffice((s) => Boolean(s.state))
  const ControlPanel = officeExtensions.controlPanel

  if (tier === 'fallback') {
    const webgl = hasWebGL2Support()
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          title={t.office.title}
          description={t.office.subtitle}
          actions={
            webgl ? <View3dOptIn /> : null
          }
        />
        {webgl ? null : (
          <p
            role="note"
            data-webgl-unavailable
            className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground"
          >
            {t.office.webglUnavailable}
          </p>
        )}
        {ControlPanel ? <ControlPanel /> : null}
        <OrgTabs compact />
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

      <div className="relative space-y-4">
        {ControlPanel ? (
          <div className="lg:absolute lg:right-4 lg:top-4 lg:z-20 lg:w-60">
            <ControlPanel />
          </div>
        ) : null}

        <CanvasErrorBoundary
          fallback={(retry) => (
            <div className="space-y-4">
              <div
                role="status"
                data-canvas-error
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-waiting/30 bg-waiting-soft px-4 py-3 text-xs text-waiting"
              >
                <span>{t.office.canvasError}</span>
                <Button size="sm" variant="outline" onClick={retry} data-reload-scene>
                  {t.office.reloadScene}
                </Button>
              </div>
              <OrgList compact />
            </div>
          )}
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
    </div>
  )
}

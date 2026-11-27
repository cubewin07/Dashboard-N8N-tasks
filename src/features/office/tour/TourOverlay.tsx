import { Pause, Play, SkipForward, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { cn, fmt } from '@/lib/utils'
import { useLabel } from '@/office'
import { exitTour, nextTourStep, startTour, toggleTourPause, useTourStore } from './useTour'

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Space on a focused button or link is that control's own click, not "pause". */
function isPressable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a, [role="button"]') !== null
}

/**
 * Captions for the guided tour: bottom-centre, large enough to read across a room,
 * progress dots, and Space / → / Esc. Leaving the office ends the tour (and restores).
 */
export function TourOverlay() {
  const { t } = useI18n()
  const label = useLabel()
  const view = useTourStore((s) => s.view)
  const active = view !== null
  const pauseRef = useRef<HTMLButtonElement>(null)

  useEffect(() => () => exitTour(), [])

  // The start button disappears when the tour starts and comes back when it ends:
  // keep keyboard focus with the controls, then hand it back (P11-T12).
  useEffect(() => {
    if (!active) return
    pauseRef.current?.focus({ preventScroll: true })
    return () => {
      requestAnimationFrame(() => {
        const start = document.querySelector<HTMLElement>('[data-tour-start]')
        if (start && (document.activeElement === document.body || document.activeElement === null)) {
          start.focus({ preventScroll: true })
        }
      })
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      let handled = true
      if (e.key === ' ') {
        if (isPressable(e.target)) return
        toggleTourPause()
      }
      else if (e.key === 'ArrowRight') nextTourStep()
      else if (e.key === 'Escape') exitTour()
      else handled = false
      if (handled) {
        // Capture phase on window: the camera shortcuts (Esc = overview) never see it.
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [active])

  if (!view) return null
  const step = view.steps[view.index]
  if (!step) return null
  const paused = view.status === 'paused'

  return (
    <section
      aria-label={t.office.tour.region}
      data-tour
      data-tour-step={step.id}
      data-tour-status={view.status}
      className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex w-full max-w-4xl flex-col gap-3 rounded-2xl border border-border bg-surface/95 px-5 py-4 shadow-lg backdrop-blur">
        <p
          aria-live="polite"
          data-tour-caption
          className="text-balance text-center text-xl font-semibold leading-snug text-foreground md:text-2xl lg:text-3xl"
        >
          {label(step.caption)}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="sr-only">{fmt(t.office.tour.progress, { n: view.index + 1, total: view.steps.length })}</span>
            <ol aria-hidden className="flex items-center gap-1.5">
              {view.steps.map((s, i) => (
                <li
                  key={s.id}
                  className={cn(
                    'size-2 rounded-full',
                    i === view.index ? 'bg-primary' : i < view.index ? 'bg-primary/40' : 'bg-border',
                  )}
                />
              ))}
            </ol>
            {paused ? <span className="text-xs font-medium text-waiting">{t.office.tour.paused}</span> : null}
          </div>
          <p className="hidden text-xs text-muted-foreground md:block">{t.office.tour.keys}</p>
          <div className="flex items-center gap-2">
            <Button ref={pauseRef} size="sm" variant="outline" onClick={toggleTourPause} data-tour-pause>
              {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
              <span>{paused ? t.office.tour.resume : t.office.tour.pause}</span>
            </Button>
            <Button size="sm" variant="outline" onClick={nextTourStep} data-tour-next>
              <SkipForward className="size-4" aria-hidden />
              <span>{t.office.tour.next}</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={exitTour} data-tour-exit>
              <X className="size-4" aria-hidden />
              <span>{t.office.tour.exit}</span>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

export function TourButton() {
  const { t } = useI18n()
  const active = useTourStore((s) => s.view !== null)
  if (active) return null
  return (
    <Button size="sm" onClick={startTour} data-tour-start>
      <Play className="size-4" aria-hidden />
      <span>{t.office.tour.start}</span>
    </Button>
  )
}

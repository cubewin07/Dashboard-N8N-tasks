import { RotateCcw, RotateCw } from 'lucide-react'
import { Component, lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppearanceV1 } from '@/domain/appearance'
import { useI18n } from '@/i18n'
import { cn, fmt } from '@/lib/utils'
import { useLabel } from '@/office/hooks'
import { assetUrl } from '@/scene/render/assets/manifest'
import { visibleWorn } from './outfit'
import { PREVIEW_CLIPS, type PreviewClip, type PreviewZoom } from './preview/previewTypes'

const PreviewCanvas = lazy(() => import('./preview/PreviewCanvas'))

export interface WardrobePreviewProps {
  /** The look to show (the editor draft). */
  appearance: AppearanceV1
  /** Name for the screen-reader description. */
  name: string
  /** Show this look instead (hold-to-compare shows the saved one). */
  showSaved?: AppearanceV1 | null
  className?: string
}

/** True when a WebGL context can be created, unless `?nowebgl` / `VITE_NO_WEBGL` forces the fallback. */
export function canUseWebgl(): boolean {
  try {
    if (import.meta.env.VITE_NO_WEBGL === '1' || /[?&]nowebgl\b/.test(window.location.hash + window.location.search)) {
      return false
    }
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return gl !== null
  } catch {
    return false
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

class RenderBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** R2: live 3D look of the draft (own small canvas), motion buttons, zoom, and a no-WebGL thumbnail stack. */
export function WardrobePreview({ appearance, name, showSaved, className }: WardrobePreviewProps) {
  const { t, lang } = useI18n()
  const label = useLabel()
  const descId = useId()
  const shown = showSaved ?? appearance
  const [webgl] = useState(canUseWebgl)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [clip, setClip] = useState<PreviewClip>('idle')
  const [zoom, setZoom] = useState<PreviewZoom>('body')
  const yawRef = useRef(0)
  const invalidateRef = useRef<() => void>(() => {})
  const [reduced] = useState(prefersReducedMotion)

  const worn = useMemo(() => visibleWorn(shown), [shown])
  const description = useMemo(() => {
    const items = worn.length
      ? worn.map((w) => `${t.wardrobe.slots[w.slot]}: ${label(w.item.label)}`).join(', ')
      : t.wardrobe.preview.nothingWorn.replace(/\.$/, '')
    return `${fmt(t.wardrobe.preview.describe, { name, items })} ${fmt(t.wardrobe.preview.describeBody, { base: t.wardrobe.preview.base[shown.base] })}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worn, name, shown.base, lang, t])

  // The wave clip plays once, then the figure goes back to standing.
  useEffect(() => {
    if (clip !== 'wave') return
    const timer = window.setTimeout(() => setClip('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [clip])

  const onReady = useCallback(() => setReady(true), [])
  const rotate = (delta: number) => {
    yawRef.current += delta
    invalidateRef.current()
  }

  const use3d = webgl && !failed

  return (
    <section
      aria-label={t.wardrobe.preview.region}
      aria-describedby={descId}
      className={cn('flex min-h-0 flex-col gap-2', className)}
      data-testid="wardrobe-preview"
      data-mode={use3d ? '3d' : 'fallback'}
      data-ready={use3d ? String(ready) : 'true'}
      data-clip={clip}
      data-zoom={zoom}
    >
      <p id={descId} className="sr-only" data-testid="wardrobe-outfit-description">
        {description}
      </p>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-primary-soft to-surface-muted">
        {use3d ? (
          <RenderBoundary onError={() => setFailed(true)}>
            <Suspense fallback={null}>
              <PreviewCanvas
                appearance={shown}
                clip={clip}
                zoom={zoom}
                reducedMotion={reduced}
                yawRef={yawRef}
                invalidateRef={invalidateRef}
                onReady={onReady}
              />
            </Suspense>
          </RenderBoundary>
        ) : (
          <ThumbnailStack worn={worn} failed={failed} />
        )}
        {use3d && !ready && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground" role="status">
            {t.wardrobe.preview.loading}
          </p>
        )}
        {use3d && ready && (
          <p className="pointer-events-none absolute left-3 top-2 text-xs text-muted-foreground">{t.wardrobe.preview.dragHint}</p>
        )}
        {showSaved && (
          <p className="pointer-events-none absolute right-3 top-2 rounded-full bg-surface px-2 py-0.5 text-xs font-medium" role="status">
            {t.wardrobe.preview.showingSaved}
          </p>
        )}
      </div>

      {use3d && (
        <div className="flex flex-wrap items-center gap-2" data-testid="wardrobe-preview-controls">
          <div role="group" aria-label={t.wardrobe.preview.clipLabel} className="flex flex-wrap gap-1">
            {PREVIEW_CLIPS.map((c) => (
              <ToggleButton key={c} pressed={clip === c} onClick={() => setClip(c)} testId={`clip-${c}`}>
                {t.wardrobe.preview.clips[c]}
              </ToggleButton>
            ))}
          </div>
          <div role="group" aria-label={t.wardrobe.preview.zoomLabel} className="flex gap-1">
            <ToggleButton pressed={zoom === 'body'} onClick={() => setZoom('body')} testId="zoom-body">
              {t.wardrobe.preview.zoomBody}
            </ToggleButton>
            <ToggleButton pressed={zoom === 'head'} onClick={() => setZoom('head')} testId="zoom-head">
              {t.wardrobe.preview.zoomHead}
            </ToggleButton>
          </div>
          <div role="group" aria-label={t.wardrobe.preview.rotateLabel} className="flex gap-1">
            <button
              type="button"
              aria-label={t.wardrobe.preview.rotateLeft}
              onClick={() => rotate(-0.6)}
              className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-muted"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t.wardrobe.preview.rotateRight}
              onClick={() => rotate(0.6)}
              className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-muted"
            >
              <RotateCw className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function ToggleButton({ pressed, onClick, testId, children }: { pressed: boolean; onClick: () => void; testId: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'min-h-11 rounded-xl border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        pressed ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface hover:bg-surface-muted',
      )}
    >
      {children}
    </button>
  )
}

/** No-WebGL view: the worn items as a wrapped stack of thumbnails (editing still works). */
function ThumbnailStack({ worn, failed }: { worn: ReturnType<typeof visibleWorn>; failed: boolean }) {
  const { t } = useI18n()
  const label = useLabel()
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3" data-testid="wardrobe-thumb-stack">
      <p className="text-sm text-muted-foreground">{failed ? t.wardrobe.preview.renderFailed : t.wardrobe.preview.noWebgl}</p>
      {worn.length === 0 ? (
        <p className="text-sm">{t.wardrobe.preview.nothingWorn}</p>
      ) : (
        <ul aria-label={t.wardrobe.preview.stackLabel} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {worn.map((w) => (
            <li key={w.slot} className="flex flex-col items-center gap-1 rounded-xl bg-surface p-2 text-center">
              <img src={assetUrl(w.item.thumb)} alt="" loading="lazy" className="size-14 object-contain" />
              <span className="text-xs leading-tight">
                <span className="block text-muted-foreground">{t.wardrobe.slots[w.slot]}</span>
                {label(w.item.label)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

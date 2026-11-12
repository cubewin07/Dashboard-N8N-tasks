import { Building2, Compass, Layers, UserCheck } from 'lucide-react'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { usePeopleUi } from '@/office/uiStore'
import { useViewStore } from '@/scene/camera/viewStore'

export interface CameraModeBarProps {
  floorKeys: readonly string[]
}

export function CameraModeBar({ floorKeys }: CameraModeBarProps) {
  const { t } = useI18n()
  const mode = useViewStore((s) => s.mode)
  const focusedFloorKey = useViewStore((s) => s.focusedFloorKey)
  const hoveredFloorKey = useViewStore((s) => s.hoveredFloorKey)
  const setOverview = useViewStore((s) => s.setOverview)
  const setFree = useViewStore((s) => s.setFree)
  const focusFloor = useViewStore((s) => s.focusFloor)
  const selectedId = usePeopleUi((s) => s.selectedId)
  const followedId = usePeopleUi((s) => s.followedId)
  const follow = usePeopleUi((s) => s.follow)
  const followTarget = followedId ?? selectedId

  const handleFloorMode = () => {
    const target =
      focusedFloorKey ??
      hoveredFloorKey ??
      floorKeys[Math.min(1, Math.max(0, floorKeys.length - 1))]
    if (target) {
      focusFloor(target)
    }
  }

  return (
    <div
      role="toolbar"
      aria-label={t.office.cameraModeAriaLabel}
      data-camera-mode-bar
      className="pointer-events-auto inline-flex items-center gap-1 rounded-[12px] border border-border bg-surface/90 p-1.5 shadow-sm backdrop-blur-md"
    >
      <button
        type="button"
        data-camera-mode="overview"
        aria-pressed={mode === 'overview'}
        onClick={setOverview}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          mode === 'overview'
            ? 'bg-primary text-primary-foreground'
            : 'text-foreground hover:bg-muted',
        )}
      >
        <Building2 className="size-3.5" aria-hidden="true" />
        <span>{t.office.modeOverview}</span>
      </button>

      <button
        type="button"
        data-camera-mode="free"
        aria-pressed={mode === 'free'}
        onClick={setFree}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          mode === 'free'
            ? 'bg-primary text-primary-foreground'
            : 'text-foreground hover:bg-muted',
        )}
      >
        <Compass className="size-3.5" aria-hidden="true" />
        <span>{t.office.modeFree}</span>
      </button>

      <button
        type="button"
        data-camera-mode="floor"
        aria-pressed={mode === 'floor' && followedId === null}
        onClick={handleFloorMode}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          mode === 'floor' && followedId === null
            ? 'bg-primary text-primary-foreground'
            : 'text-foreground hover:bg-muted',
        )}
      >
        <Layers className="size-3.5" aria-hidden="true" />
        <span>{t.office.modeFloor}</span>
      </button>

      <button
        type="button"
        data-camera-mode="follow"
        aria-pressed={followedId !== null}
        disabled={followTarget === null}
        title={followTarget === null ? t.office.followPickHint : undefined}
        onClick={() => follow(followedId ? null : selectedId)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          followedId !== null
            ? 'bg-primary text-primary-foreground'
            : followTarget === null
              ? 'cursor-not-allowed text-muted-foreground/60'
              : 'text-foreground hover:bg-muted',
        )}
      >
        <UserCheck className="size-3.5" aria-hidden="true" />
        <span>{t.office.modeFollow}</span>
      </button>
    </div>
  )
}

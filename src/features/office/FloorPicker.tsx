import { useMemo } from 'react'
import type { PaletteSwatch } from '@/domain/config'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useViewStore } from '@/scene/camera/viewStore'
import type { FloorLayout } from '@/scene/layout'

export interface FloorPickerProps {
  floors: readonly FloorLayout[]
  palette: readonly PaletteSwatch[]
}

export function FloorPicker({ floors, palette }: FloorPickerProps) {
  const { lang, t } = useI18n()
  const mode = useViewStore((s) => s.mode)
  const focusedFloorKey = useViewStore((s) => s.focusedFloorKey)
  const hoveredFloorKey = useViewStore((s) => s.hoveredFloorKey)
  const focusFloor = useViewStore((s) => s.focusFloor)
  const setHoveredFloor = useViewStore((s) => s.setHoveredFloor)

  const swatchMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of palette) {
      map.set(s.key, s.hex)
    }
    return map
  }, [palette])

  const topToBottomFloors = useMemo(() => floors.slice().reverse(), [floors])

  return (
    <nav
      aria-label={t.office.floorPickerAriaLabel}
      data-floor-picker
      className="pointer-events-auto flex max-h-[calc(100%-2rem)] w-52 flex-col gap-1 overflow-y-auto rounded-[12px] border border-border bg-surface/90 p-2 shadow-sm backdrop-blur-md"
    >
      <p className="px-2 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {t.office.floorPickerTitle}
      </p>
      <div className="flex flex-col gap-1">
        {topToBottomFloors.map((floor) => {
          const isFocused = mode === 'floor' && focusedFloorKey === floor.key
          const isHovered = hoveredFloorKey === floor.key
          const headcount = Object.keys(floor.occupants).length
          const swatchHex = swatchMap.get(floor.colorSwatch) ?? '#64748b'

          return (
            <button
              key={floor.key}
              type="button"
              data-floor-picker-item={floor.key}
              aria-current={isFocused ? 'true' : undefined}
              onClick={() => focusFloor(floor.key)}
              onMouseEnter={() => setHoveredFloor(floor.key)}
              onMouseLeave={() => setHoveredFloor(null)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                isFocused
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : isHovered
                    ? 'bg-muted text-foreground'
                    : 'text-foreground hover:bg-muted/70',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: swatchHex }}
                />
                <span className="shrink-0 font-mono text-[11px] opacity-80">
                  {t.office.floorNumberPrefix}
                  {floor.index + 1}
                </span>
                <span className="truncate">{floor.label[lang]}</span>
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px]',
                  isFocused
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
                title={`${headcount} ${t.office.staffCountSuffix}`}
              >
                {headcount}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

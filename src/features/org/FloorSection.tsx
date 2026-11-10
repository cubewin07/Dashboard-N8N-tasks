import type { CSSProperties } from 'react'
import type { PaletteSwatch } from '@/domain/config'
import type { OrgFloorNode } from '@/domain/selectors'
import type { PersonRuntime } from '@/domain/work'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useLabel } from '@/office/hooks'
import { PersonRow } from './PersonRow'

export function FloorSection({
  floor,
  swatch,
  peopleRuntime,
  compact = false,
}: {
  floor: OrgFloorNode
  swatch?: PaletteSwatch
  peopleRuntime?: Record<string, PersonRuntime>
  compact?: boolean
}) {
  const { t } = useI18n()
  const label = useLabel()

  const deptStyle = {
    '--dept': swatch?.hex ?? 'var(--primary)',
    '--dept-soft': swatch?.softHex ?? 'var(--primary-soft)',
  } as CSSProperties

  const floorBadgeText =
    floor.kind === 'boss'
      ? fmt(t.org.topFloorBadge, { n: floor.floorNumber })
      : fmt(t.org.floorBadge, { n: floor.floorNumber })

  return (
    <section
      data-floor-key={floor.floorKey}
      data-floor-kind={floor.kind}
      style={deptStyle}
      className="overflow-hidden rounded-[14px] border border-border bg-surface"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted/40 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            style={{
              backgroundColor: 'var(--dept-soft)',
              color: 'var(--dept)',
            }}
            className="tabular inline-flex shrink-0 items-center rounded-lg px-2.5 py-1 text-xs font-semibold"
          >
            {floorBadgeText}
          </span>
          <h2 className="truncate text-base font-semibold text-foreground">
            {label(floor.label)}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {floor.kind === 'department' && (
            <span className="rounded-md bg-surface px-2 py-0.5 font-medium">
              {floor.hours === '24_7' ? t.org.hours247 : t.org.hoursOffice}
            </span>
          )}
          <span className="tabular font-medium">
            {fmt(t.org.headcount, { n: floor.people.length })}
          </span>
        </div>
      </header>

      <div className="space-y-2 p-3 sm:p-4">
        {floor.people.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t.org.emptyDepartment}
          </p>
        ) : (
          floor.people.map((node) => {
            const runtime = peopleRuntime?.[node.employee.id]
            return (
              <PersonRow
                key={node.employee.id}
                node={node}
                activity={runtime?.activity ?? 'idle'}
                compact={compact}
              />
            )
          })
        )}
      </div>
    </section>
  )
}

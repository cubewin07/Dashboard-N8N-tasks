import { useEffect, useMemo } from 'react'
import { ListSkeleton, LoadErrorState } from '@/components'
import { archivedStaff, orgTree, pileFor } from '@/domain/selectors'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useBootFailure, useConfig, useFeedPhase, useLabel, useOfficeSelector } from '@/office/hooks'
import { startOffice } from '@/office/store'
import { FloorSection } from './FloorSection'

export function OrgList({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  const label = useLabel()
  const { config, status } = useConfig()
  const { retry } = useBootFailure()
  const phase = useFeedPhase()
  const state = useOfficeSelector((s) => s)
  const activeConfig = state?.config ?? config
  const peopleRuntime = state?.people

  // Imported per specification; used in PersonRow
  void pileFor

  useEffect(() => {
    if (!config && status === 'loading') {
      startOffice()
    }
  }, [config, status])

  const floors = useMemo(() => (activeConfig ? orgTree(activeConfig) : []), [activeConfig])
  const swatchMap = useMemo(
    () => new Map((activeConfig?.palette ?? []).map((s) => [s.key, s])),
    [activeConfig],
  )
  const roleMap = useMemo(
    () => new Map((activeConfig?.roles ?? []).map((r) => [r.key, r])),
    [activeConfig],
  )
  const archived = useMemo(() => (state ? archivedStaff(state) : []), [state])

  if (phase === 'failed') {
    return <LoadErrorState onRetry={retry} />
  }

  // Busy/idle badges come from the feed: without its state every row would read "Rảnh".
  if (!activeConfig || phase === 'connecting') {
    return <ListSkeleton label={t.org.loading} />
  }

  return (
    <div data-org-list className="space-y-4">
      {floors.map((floor) => (
        <FloorSection
          key={floor.floorKey}
          floor={floor}
          swatch={swatchMap.get(floor.colorSwatch)}
          state={state}
          peopleRuntime={peopleRuntime}
          compact={compact}
        />
      ))}

      <details
        data-archived-section
        className="rounded-[14px] border border-border bg-surface p-3.5"
      >
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
          {fmt(t.org.archivedSectionTitle, { n: archived.length })}
        </summary>
        {archived.length > 0 && (
          <div className="mt-3 space-y-2">
            {archived.map((emp) => {
              const role = roleMap.get(emp.roleKey)
              return (
                <div
                  key={emp.id}
                  data-employee-id={emp.id}
                  data-archived-employee
                  className="flex items-center justify-between rounded-xl border border-border bg-surface-muted/30 p-2.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{emp.name}</span>
                    {role && (
                      <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {label(role.label)}
                      </span>
                    )}
                  </div>
                  <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {t.org.archivedBadge}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </details>
    </div>
  )
}

import { useEffect, useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { orgTree } from '@/domain/selectors'
import { useI18n } from '@/i18n'
import { useConfig, useOfficeSelector } from '@/office/hooks'
import { bootOffice } from '@/office/store'
import { FloorSection } from './FloorSection'

export function OrgList({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  const { config, status } = useConfig()
  const peopleRuntime = useOfficeSelector((s) => s?.people)

  useEffect(() => {
    if (!config && status === 'loading') {
      void bootOffice()
    }
  }, [config, status])

  const floors = useMemo(() => (config ? orgTree(config) : []), [config])
  const swatchMap = useMemo(
    () => new Map((config?.palette ?? []).map((s) => [s.key, s])),
    [config],
  )

  if (!config || status === 'loading') {
    return (
      <div aria-busy="true" aria-label={t.org.loading} className="space-y-4">
        <Skeleton className="h-32 w-full rounded-[14px]" />
        <Skeleton className="h-44 w-full rounded-[14px]" />
        <Skeleton className="h-44 w-full rounded-[14px]" />
      </div>
    )
  }

  return (
    <div data-org-list className="space-y-4">
      {floors.map((floor) => (
        <FloorSection
          key={floor.floorKey}
          floor={floor}
          swatch={swatchMap.get(floor.colorSwatch)}
          peopleRuntime={peopleRuntime}
          compact={compact}
        />
      ))}
    </div>
  )
}

import { useMemo } from 'react'
import { useConfig, useOfficeSelector } from '@/office/hooks'
import { buildPeopleGroups, type PeopleListGroup } from './peopleListModel'

/**
 * Active people grouped like the org list. `null` until a config is loaded.
 * Depends only on the config object, so feed batches do not recompute it.
 */
export function usePeopleDirectory(): PeopleListGroup[] | null {
  const liveConfig = useOfficeSelector((s) => s?.config ?? null)
  const { config } = useConfig()
  const activeConfig = liveConfig ?? config
  return useMemo(
    () => (activeConfig ? buildPeopleGroups(activeConfig) : null),
    [activeConfig],
  )
}

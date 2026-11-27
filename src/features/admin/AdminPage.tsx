// P10-T05 · Quản trị (boss only, R1). Each tab edits one part of the config through
// `useConfigEdit` → office/configStore → ConfigSource. The active tab lives in `?tab=`.
import type { ComponentType } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LoadErrorState, PageHeader } from '@/components'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/i18n'
import { useBootFailure, useConfig } from '@/office/hooks'
import { BackupTab } from './tabs/BackupTab'
import { DepartmentsTab } from './tabs/DepartmentsTab'
import { HistoryTab } from './tabs/HistoryTab'
import { PeopleTab } from './tabs/PeopleTab'
import { PlatformsTab } from './tabs/PlatformsTab'
import { PolicyTab } from './tabs/PolicyTab'
import { RolesTab } from './tabs/RolesTab'
import { RulesTab } from './tabs/RulesTab'
import { SpecialtiesTab } from './tabs/SpecialtiesTab'

export const ADMIN_TABS = [
  'departments',
  'people',
  'roles',
  'specialties',
  'policy',
  'rules',
  'platforms',
  'history',
  'backup',
] as const

export type AdminTab = (typeof ADMIN_TABS)[number]

const TAB_COMPONENTS: Record<AdminTab, ComponentType> = {
  departments: DepartmentsTab,
  people: PeopleTab,
  roles: RolesTab,
  specialties: SpecialtiesTab,
  policy: PolicyTab,
  rules: RulesTab,
  platforms: PlatformsTab,
  history: HistoryTab,
  backup: BackupTab,
}

function isAdminTab(value: string | null): value is AdminTab {
  return value !== null && (ADMIN_TABS as readonly string[]).includes(value)
}

export function AdminPage() {
  const { t } = useI18n()
  const { config } = useConfig()
  const { failed, retry } = useBootFailure()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: AdminTab = isAdminTab(raw) ? raw : 'departments'

  const select = (value: string) => {
    if (!isAdminTab(value)) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', value)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="space-y-4 pb-12" data-admin-page>
      <PageHeader title={t.admin.title} description={t.admin.description} />
      {failed && !config ? (
        <LoadErrorState onRetry={retry} />
      ) : !config ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={select}>
          <TabsList aria-label={t.admin.tabsAriaLabel} className="w-full justify-start">
            {ADMIN_TABS.map((key) => (
              <TabsTrigger key={key} value={key} data-admin-tab={key}>
                {t.admin.tabs[key]}
              </TabsTrigger>
            ))}
          </TabsList>
          {ADMIN_TABS.map((key) => {
            const Tab = TAB_COMPONENTS[key]
            return (
              <TabsContent key={key} value={key}>
                {key === tab && <Tab />}
              </TabsContent>
            )
          })}
        </Tabs>
      )}
    </div>
  )
}

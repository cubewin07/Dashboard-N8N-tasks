import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PeopleList } from '@/features/office/PeopleList'
import { PersonDrawer } from '@/features/office/PersonDrawer'
import { useI18n } from '@/i18n'
import { OrgList } from './OrgList'

/** Sơ đồ / Nhân sự: the org page body, also the 2D office on phones (R2). */
export function OrgTabs({ compact }: { compact?: boolean }) {
  const { t } = useI18n()
  return (
    <>
      <Tabs defaultValue="org">
        <TabsList aria-label={t.org.tabsAriaLabel}>
          <TabsTrigger value="org">{t.org.tabOrg}</TabsTrigger>
          <TabsTrigger value="people">{t.org.tabPeople}</TabsTrigger>
        </TabsList>
        <TabsContent value="org">
          <OrgList compact={compact} />
        </TabsContent>
        <TabsContent value="people">
          <PeopleList variant="page" />
        </TabsContent>
      </Tabs>
      <PersonDrawer placement="screen" />
    </>
  )
}

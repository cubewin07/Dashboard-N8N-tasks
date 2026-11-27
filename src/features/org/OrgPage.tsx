import { PageHeader } from '@/components'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PeopleList } from '@/features/office/PeopleList'
import { PersonDrawer } from '@/features/office/PersonDrawer'
import { useI18n } from '@/i18n'
import { OrgList } from './OrgList'

export function OrgPage() {
  const { t } = useI18n()
  return (
    <div className="space-y-6 pb-12">
      <PageHeader title={t.org.title} description={t.org.description} />
      <Tabs defaultValue="org">
        <TabsList aria-label={t.org.tabsAriaLabel}>
          <TabsTrigger value="org">{t.org.tabOrg}</TabsTrigger>
          <TabsTrigger value="people">{t.org.tabPeople}</TabsTrigger>
        </TabsList>
        <TabsContent value="org">
          <OrgList />
        </TabsContent>
        <TabsContent value="people">
          <PeopleList variant="page" />
        </TabsContent>
      </Tabs>
      <PersonDrawer placement="screen" />
    </div>
  )
}

import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components'
import { Card } from '@/components/ui/card'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { StartWizard } from './StartWizard'

/** #/start: the same wizard inline (a bottom-tab destination on mobile). Goes to the new task on success. */
export function StartPage() {
  const { t } = useI18n()
  const navigate = useNavigate()

  const handleStarted = (taskId: number | null) => {
    if (taskId === null) {
      toast.success(t.start.successDescription)
      navigate('/tasks')
      return
    }
    toast.success(fmt(t.start.success, { id: taskId }), { description: t.start.successDescription })
    navigate(`/tasks/${taskId}`)
  }

  return (
    <section className="mx-auto w-full max-w-3xl">
      <PageHeader title={t.start.title} description={t.start.pageDescription} />
      <Card className="flex flex-col">
        <StartWizard layout="page" onStarted={handleStarted} />
      </Card>
    </section>
  )
}

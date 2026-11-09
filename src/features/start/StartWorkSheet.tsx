import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useStartWork } from '@/app/startWork'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { StartWizard } from './StartWizard'

/** The global "+ Giao việc" sheet. Radix unmounts the content on close, so the wizard starts fresh (with the preset) on every open. */
export function StartWorkSheet() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { open, setOpen, preset } = useStartWork()

  const handleStarted = (taskId: number | null) => {
    setOpen(false)
    if (taskId === null) {
      toast.success(t.start.successDescription)
      return
    }
    toast.success(fmt(t.start.success, { id: taskId }), {
      description: t.start.successDescription,
      action: { label: fmt(t.start.viewTask, { id: taskId }), onClick: () => navigate(`/tasks/${taskId}`) },
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{t.start.title}</SheetTitle>
          <SheetDescription>{t.start.sheetDescription}</SheetDescription>
        </SheetHeader>
        <StartWizard layout="sheet" preset={preset} onStarted={handleStarted} />
      </SheetContent>
    </Sheet>
  )
}

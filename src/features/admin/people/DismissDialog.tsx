import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Employee } from '@/domain/config'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { toast } from 'sonner'
import { IssueList } from '../shared/IssueList'
import { SaveStatusText } from '../shared/EditorSheet'
import { useConfigEdit } from '../shared/useConfigEdit'
import { useChangeIssues } from './useChangeIssues'

/**
 * Confirmation before `employee.archive` (reason 'dismissed'). The validator speaks first: if the
 * person is the only Manager or the only owner the issue shows here and the button stays off.
 */
export function DismissDialog({ person, onClose }: { person: Employee; onClose: () => void }) {
  const { t } = useI18n()
  const d = t.adminPeople.people.dismiss
  const { status, save } = useConfigEdit()
  const { issues, blocking } = useChangeIssues({
    kind: 'employee.archive',
    id: person.id,
    reason: 'dismissed',
  })

  const confirm = async () => {
    if (await save({ kind: 'employee.archive', id: person.id, reason: 'dismissed' })) {
      toast.success(fmt(d.done, { name: person.name }))
      onClose()
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fmt(d.title, { name: person.name })}</DialogTitle>
          <DialogDescription>{fmt(d.description, { name: person.name })}</DialogDescription>
        </DialogHeader>
        <IssueList issues={issues} />
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <SaveStatusText status={status} />
          <Button type="button" variant="outline" onClick={onClose}>
            {d.cancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={blocking || status === 'saving'}
            onClick={() => void confirm()}
          >
            {d.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

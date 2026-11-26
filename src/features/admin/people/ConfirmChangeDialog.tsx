import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ConfigChange } from '@/domain/config'
import { useI18n } from '@/i18n'
import { SaveStatusText } from '../shared/EditorSheet'
import { IssueList } from '../shared/IssueList'
import { useConfigEdit } from '../shared/useConfigEdit'
import { useChangeIssues } from './useChangeIssues'

/**
 * Confirm one destructive change (dismiss, delete). The validator speaks first: when the change
 * would break an invariant the issue shows here and the confirm button stays off (R10).
 */
export function ConfirmChangeDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  successMessage,
  change,
  onClose,
}: {
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  successMessage: string
  change: ConfigChange
  onClose: () => void
}) {
  const { t } = useI18n()
  const { status, save } = useConfigEdit()
  const { issues, blocking } = useChangeIssues(change)

  const confirm = async () => {
    if (await save(change)) {
      toast.success(successMessage)
      onClose()
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <IssueList issues={issues} />
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <SaveStatusText status={status} />
          <Button type="button" variant="outline" onClick={onClose}>
            {cancelLabel || t.admin.save.cancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={blocking || status === 'saving'}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

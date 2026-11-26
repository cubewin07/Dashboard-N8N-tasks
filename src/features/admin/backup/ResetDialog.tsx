import { useId, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label as FieldLabel } from '@/components/ui/label'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { seedConfig } from '@/office/configStore'
import { IssueList } from '../shared/IssueList'
import { useConfigEdit } from '../shared/useConfigEdit'

/** "Khôi phục mặc định": the boss must type the shown word before the seed replaces everything. */
export function ResetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const tr = t.adminRules.backup.reset
  const id = useId()
  const [typed, setTyped] = useState('')
  const { status, issues, save, reset } = useConfigEdit()
  const matches = typed.trim().toLocaleUpperCase('vi-VN') === tr.word.toLocaleUpperCase('vi-VN')

  const close = (next: boolean) => {
    if (!next) {
      setTyped('')
      reset()
    }
    onOpenChange(next)
  }

  const confirm = async () => {
    if (!matches) return
    const ok = await save({ kind: 'config.replace', config: seedConfig() })
    if (ok) {
      toast.success(tr.done)
      close(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (status !== 'saving') void confirm()
          }}
        >
          <DialogHeader>
            <DialogTitle>{tr.dialogTitle}</DialogTitle>
            <DialogDescription>{tr.dialogBody}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <FieldLabel htmlFor={`${id}-confirm`}>{fmt(tr.typeLabel, { word: tr.word })}</FieldLabel>
            <Input
              id={`${id}-confirm`}
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          <IssueList issues={issues} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              {t.adminRules.backup.cancel}
            </Button>
            <Button type="submit" variant="danger" disabled={!matches || status === 'saving'}>
              {status === 'saving' ? tr.working : tr.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

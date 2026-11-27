// R13 / §3.5: someone else saved this look while it was open. Nothing is lost silently:
// closing the dialog keeps the draft; "Tải lại" replaces it with the stored look, "Ghi đè" saves
// the draft over it (retrying with the server's version).
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/i18n'
import type { AppearanceConflictError } from '@/ports/AppearanceStore'

export interface ConflictDialogProps {
  conflict: AppearanceConflictError | null
  saving?: boolean
  /** Take the stored look as the draft. */
  onReload: (conflict: AppearanceConflictError) => void
  /** Save the draft over the stored look. */
  onOverwrite: (conflict: AppearanceConflictError) => void
  /** Dismiss and keep editing. */
  onClose: () => void
}

export function ConflictDialog({ conflict, saving = false, onReload, onOverwrite, onClose }: ConflictDialogProps) {
  const { t } = useI18n()
  const text = t.wardrobeEditor.conflict
  return (
    <Dialog open={conflict !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>{text.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => conflict && onReload(conflict)}>
            {text.reload}
          </Button>
          <Button disabled={saving} onClick={() => conflict && onOverwrite(conflict)}>
            {text.overwrite}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Quiet notice while editing: a newer saved look arrived, the draft stays as it is. */
export function RemoteChangeBanner({ onReload }: { onReload: () => void }) {
  const { t } = useI18n()
  return (
    <div
      role="status"
      data-testid="wardrobe-remote-change"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm"
    >
      <span className="min-w-0 flex-1">{t.wardrobeEditor.conflict.remoteChange}</span>
      <Button variant="outline" size="sm" onClick={onReload}>
        {t.wardrobeEditor.conflict.reload}
      </Button>
    </div>
  )
}

import { Box } from 'lucide-react'
import { useState } from 'react'
import { isSmallScreen, useDeviceTierPreference } from '@/app/deviceTier'
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

/** R3: phones turn 3D on only after a battery and data warning. */
export function Confirm3dDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const copy = t.office.view3dWarning
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-view3d-warning>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {copy.cancel}
          </Button>
          <Button
            data-view3d-confirm
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "Xem 3D": straight to 3D on a large screen, through the warning on a phone. */
export function View3dOptIn() {
  const { t } = useI18n()
  const { setOverride } = useDeviceTierPreference()
  const [open, setOpen] = useState(false)
  const phone = isSmallScreen()
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        data-view3d-optin
        onClick={() => (phone ? setOpen(true) : setOverride('full3d'))}
      >
        <Box className="size-4" aria-hidden />
        <span>{phone ? t.office.view3dPhoneButton : t.office.view3dButton}</span>
      </Button>
      <Confirm3dDialog open={open} onOpenChange={setOpen} onConfirm={() => setOverride('full3d')} />
    </>
  )
}

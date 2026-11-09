import { ExternalLink } from 'lucide-react'
import type { Tables } from '@/lib/database.types'
import { demoPreviewUrl } from '@/lib/drive'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { EmployeeAvatar, ShopChip } from '@/components'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function ArtifactLightboxDialog({
  artifact,
  open,
  onOpenChange,
}: {
  artifact: Tables<'artifacts'> | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()

  if (!artifact) return null

  const sizeLabel = artifact.width && artifact.height ? `${artifact.width}×${artifact.height}` : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{artifact.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 pt-1">
            <ShopChip shopId={artifact.shop_id} />
            {sizeLabel && <span className="tabular text-xs text-muted-foreground">{fmt(t.inbox.images.dimensions, { size: sizeLabel })}</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-xl border border-border bg-surface-muted">
          <img
            src={demoPreviewUrl(artifact)}
            alt={artifact.title}
            className="max-h-[65dvh] w-full object-contain"
          />
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <EmployeeAvatar ownerKey={artifact.owner_key} size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.actions.close}
            </Button>
            <Button variant="primary" asChild>
              <a href={artifact.drive_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                {t.common.actions.openInDrive}
              </a>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

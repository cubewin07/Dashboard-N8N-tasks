import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmt } from '@/lib/utils'
import { useI18n } from '@/i18n'
import { getCatalogItem, type Catalog } from '@/scene/characters/catalog'
import type { BodyClamp } from '../logic'

interface ClampDialogProps {
  clamps: readonly BodyClamp[] | null
  catalog: Catalog
  onConfirm: () => void
  onCancel: () => void
}

/** R6: the picked item does not fit the body: clamp the body, or cancel the pick. */
export function ClampDialog({ clamps, catalog, onConfirm, onCancel }: ClampDialogProps) {
  const { t, lang } = useI18n()
  const text = t.wardrobeEditor.clamp
  const pct = (v: number): string => `${Math.round(v * 100)}`
  return (
    <Dialog open={clamps !== null} onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>{text.description}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 text-sm" data-testid="clamp-list">
          {(clamps ?? []).map((c) => {
            const item = getCatalogItem(catalog, c.item)
            return (
              <li key={c.slider}>
                {fmt(text.line, { slider: t.wardrobeEditor.body.sliders[c.slider], from: pct(c.from), to: pct(c.to) })}
                {item ? fmt(text.byItem, { item: item.label[lang] }) : ''}
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {text.cancel}
          </Button>
          <Button onClick={onConfirm}>{text.confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

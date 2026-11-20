/**
 * Right-hand editor: slot tabs + thumbnail grids, colour pickers, body tab (P08b-T08..T10).
 * Reads and writes the draft only through `useWardrobeEditor`.
 */
import { useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fmt } from '@/lib/utils'
import { useI18n } from '@/i18n'
import type { AppearanceV1 } from '@/domain/appearance'
import {
  DEFAULT_CATALOG,
  getCatalogItem,
  type BaseBody,
  type Catalog,
  type CatalogItem,
  type CatalogSlot,
} from '@/scene/characters/catalog'
import { applyClamps, applyItem, bodyClamps, getSlotItemId, hiddenSlots, type ApplyResult, type BodyClamp } from '../logic'
import { useWardrobeEditor } from '../useWardrobeEditor'
import { BodyTab } from './BodyTab'
import { ClampDialog } from './ClampDialog'
import { CharacterColor, ItemColors, setItemColor } from './ColorPickers'
import { buildTabs, isOptionalSlot, offeredItems, switchBase, type TabKey, type TabSpec } from './editorModel'
import { ItemGrid } from './ItemGrid'

interface PendingClamp {
  result: ApplyResult
  clamps: BodyClamp[]
}

interface WardrobeEditorPanelProps {
  /** Catalogue to edit against (tests inject one); defaults to the bundled catalogue. */
  catalog?: Catalog
}

export function WardrobeEditorPanel({ catalog = DEFAULT_CATALOG }: WardrobeEditorPanelProps) {
  const { t, lang } = useI18n()
  const text = t.wardrobeEditor
  const draft = useWardrobeEditor((s) => s.draft)
  const edit = useWardrobeEditor((s) => s.edit)
  const tabs = useMemo(() => buildTabs(catalog), [catalog])
  const [tab, setTab] = useState<TabKey>('body')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<PendingClamp | null>(null)

  if (!draft) {
    return (
      <section aria-label={text.panelLabel} data-testid="wardrobe-editor" className="text-sm text-muted-foreground">
        {text.noEmployee}
      </section>
    )
  }

  const nameOf = (id: string): string => getCatalogItem(catalog, id)?.label[lang] ?? id

  function describe(result: ApplyResult): string {
    const parts: string[] = []
    if (result.removed.length > 0) {
      parts.push(fmt(text.notes.removed, { items: result.removed.map((r) => nameOf(r.itemId)).join(', ') }))
    }
    if (result.restored.length > 0) {
      parts.push(fmt(text.notes.restored, { items: result.restored.map((r) => nameOf(r.itemId)).join(', ') }))
    }
    return parts.join('. ')
  }

  function pick(slot: CatalogSlot, id: string | null): void {
    const current = useWardrobeEditor.getState().draft
    if (!current) return
    const result = applyItem(current, slot, id, catalog)
    if (result.refused) {
      setNote(text.notes.refused[result.refused])
      return
    }
    if (!result.changed) return
    if (result.clamps.length > 0) {
      setPending({ result, clamps: result.clamps })
      return
    }
    edit(result.doc)
    setNote(describe(result))
  }

  function confirmClamp(): void {
    if (!pending) return
    edit(applyClamps(pending.result.doc, pending.clamps))
    setNote([describe(pending.result), text.notes.clamped].filter(Boolean).join('. '))
    setPending(null)
  }

  function changeBase(base: BaseBody): void {
    const current = useWardrobeEditor.getState().draft
    if (!current || current.base === base) return
    let next = switchBase(current, base, catalog)
    next = applyClamps(next, bodyClamps(next, catalog))
    edit(next)
    setNote(text.notes.baseChanged)
  }

  const editDoc = (next: AppearanceV1): void => edit(next)

  return (
    <section aria-label={text.panelLabel} data-testid="wardrobe-editor" className="space-y-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList aria-label={text.tabs.label} className="w-full">
          {tabs.map((tb) => (
            <TabsTrigger key={tb.key} value={tb.key}>
              {text.tabs[tb.key]}
            </TabsTrigger>
          ))}
        </TabsList>

        <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs text-muted-foreground" data-testid="editor-note">
          {note}
        </p>

        <TabsContent value="body">
          <BodyTab doc={draft} catalog={catalog} onEdit={editDoc} onBase={changeBase} />
        </TabsContent>
        {tabs
          .filter((tb) => tb.key !== 'body')
          .map((tb) => (
            <TabsContent key={tb.key} value={tb.key}>
              <SlotTab spec={tb} doc={draft} catalog={catalog} onPick={pick} onEdit={editDoc} />
            </TabsContent>
          ))}
      </Tabs>
      <ClampDialog
        clamps={pending?.clamps ?? null}
        catalog={catalog}
        onConfirm={confirmClamp}
        onCancel={() => setPending(null)}
      />
    </section>
  )
}

interface SlotTabProps {
  spec: TabSpec
  doc: AppearanceV1
  catalog: Catalog
  onPick: (slot: CatalogSlot, id: string | null) => void
  onEdit: (next: AppearanceV1) => void
}

function SlotTab({ spec, doc, catalog, onPick, onEdit }: SlotTabProps) {
  const { t } = useI18n()
  const text = t.wardrobeEditor
  const [sub, setSub] = useState<CatalogSlot | null>(null)
  const slots = spec.slots
  const active = sub && slots.includes(sub) ? sub : slots[0]

  return (
    <div className="space-y-4">
      {spec.key === 'face' ? (
        <CharacterColor
          group="eyes"
          label={text.colors.eyes}
          catalog={catalog}
          value={doc.face.eyeColor}
          onPick={(key) => onEdit({ ...doc, face: { ...doc.face, eyeColor: key } })}
        />
      ) : null}
      {spec.key === 'hair' ? (
        <CharacterColor
          group="hair"
          label={text.colors.hair}
          catalog={catalog}
          value={doc.hair.color}
          onPick={(key) => onEdit({ ...doc, hair: { ...doc.hair, color: key } })}
        />
      ) : null}

      {slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">{text.grid.emptyTab}</p>
      ) : slots.length > 1 ? (
        <Tabs value={active} onValueChange={(v) => setSub(v as CatalogSlot)}>
          <TabsList aria-label={text.tabs[spec.key as 'face' | 'accessories']} className="w-full">
            {slots.map((s) => (
              <TabsTrigger key={s} value={s}>
                {text.slots[s]}
              </TabsTrigger>
            ))}
          </TabsList>
          {slots.map((s) => (
            <TabsContent key={s} value={s}>
              <SlotPanel slot={s} doc={doc} catalog={catalog} onPick={onPick} onEdit={onEdit} />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <SlotPanel slot={slots[0]!} doc={doc} catalog={catalog} onPick={onPick} onEdit={onEdit} />
      )}
    </div>
  )
}

function hidingItem(doc: AppearanceV1, slot: CatalogSlot, catalog: Catalog): CatalogItem | null {
  if (!hiddenSlots(doc, catalog).has(slot)) return null
  for (const s of Object.keys(catalog.bySlot) as CatalogSlot[]) {
    const item = getCatalogItem(catalog, getSlotItemId(doc, s))
    if (item && s !== slot && item.hides.includes(slot)) return item
  }
  return null
}

function SlotPanel({ slot, doc, catalog, onPick, onEdit }: Omit<SlotTabProps, 'spec'> & { slot: CatalogSlot }) {
  const { t } = useI18n()
  const items = useMemo(() => offeredItems(catalog, slot, doc), [catalog, slot, doc])
  return (
    <div className="space-y-4">
      <ItemGrid
        key={slot}
        label={t.wardrobeEditor.slots[slot]}
        items={items}
        value={getSlotItemId(doc, slot)}
        allowNone={isOptionalSlot(slot)}
        hiddenBy={hidingItem(doc, slot, catalog)}
        onSelect={(id) => onPick(slot, id)}
      />
      <ItemColors
        catalog={catalog}
        doc={doc}
        slots={[slot]}
        onPick={(itemId, region, key) => onEdit(setItemColor(doc, itemId, region, key))}
      />
    </div>
  )
}

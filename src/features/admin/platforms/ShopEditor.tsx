import { useEffect, useId, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { OrgConfig, Shop } from '@/domain/config'
import { validateConfig } from '@/domain/validateConfig'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useLabel } from '@/office/hooks'
import { EditorSheet } from '../shared/EditorSheet'
import { Field } from '../shared/fields'
import { newIssues, useConfigEdit, useDraftIssues } from '../shared/useConfigEdit'
import {
  buildShopChange,
  emptyShopDraft,
  pickerPlatforms,
  shopDirty,
  shopDraftFrom,
  shopErrors,
  type ShopDraft,
} from './model'

/** Add (shop = null) or rename/move one shop. The id never changes. */
export function ShopEditor({
  config,
  shop,
  onClose,
}: {
  config: OrgConfig
  shop: Shop | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const a = t.adminOrg.platforms
  const label = useLabel()
  const id = useId()
  const [draft, setDraft] = useState<ShopDraft>(() => (shop ? shopDraftFrom(shop) : emptyShopDraft()))
  const { status, issues: saveIssues, save, reset } = useConfigEdit()

  const errors = useMemo(() => shopErrors(draft), [draft])
  const change = useMemo(
    () => (errors.length === 0 ? buildShopChange(draft, shop, config) : null),
    [draft, shop, config, errors.length],
  )
  const { issues: draftIssues, blocking } = useDraftIssues(change)
  const baseline = useMemo(() => validateConfig(config), [config])
  const shown = saveIssues.length > 0 ? saveIssues : newIssues(draftIssues, baseline)
  const canSave = shopDirty(draft, shop) && errors.length === 0 && !blocking && change !== null

  useEffect(() => {
    if (status === 'saved') onClose()
  }, [status, onClose])

  const update = (patch: Partial<ShopDraft>) => {
    reset()
    setDraft((d) => ({ ...d, ...patch }))
  }

  const platforms = pickerPlatforms(config, shop?.platformKey ?? null)

  return (
    <EditorSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={shop ? fmt(a.shopEditor.editTitle, { name: shop.name }) : a.shopEditor.addTitle}
      description={a.shopEditor.description}
      issues={shown}
      status={status}
      canSave={canSave}
      onSave={() => {
        if (change) void save(change)
      }}
    >
      <Field label={a.shopEditor.name} htmlFor={`${id}-name`}>
        <Input
          id={`${id}-name`}
          value={draft.name}
          required
          aria-invalid={draft.name !== '' && draft.name.trim() === '' ? true : undefined}
          onChange={(e) => update({ name: e.target.value })}
        />
      </Field>

      <Field label={a.shopEditor.platform} htmlFor={`${id}-platform`}>
        <Select
          value={draft.platformKey}
          onValueChange={(platformKey) => update({ platformKey })}
        >
          <SelectTrigger id={`${id}-platform`}>
            <SelectValue placeholder={a.shopEditor.platformPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {platforms.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {label(p.label)}
                {p.active ? '' : ` (${t.admin.inactive})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={a.shopEditor.handle} htmlFor={`${id}-handle`} hint={a.shopEditor.handleHint}>
        <Input
          id={`${id}-handle`}
          value={draft.handle}
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => update({ handle: e.target.value })}
        />
      </Field>
    </EditorSheet>
  )
}

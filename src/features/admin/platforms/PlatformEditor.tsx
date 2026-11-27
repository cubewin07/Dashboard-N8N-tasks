import { useEffect, useId, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { OrgConfig, Platform } from '@/domain/config'
import { validateConfig } from '@/domain/validateConfig'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { floorSwatches } from '../departments/model'
import { SwatchPicker } from '../departments/SwatchPicker'
import { EditorSheet } from '../shared/EditorSheet'
import { Field, LabelFields } from '../shared/fields'
import { newIssues, useConfigEdit, useDraftIssues } from '../shared/useConfigEdit'
import {
  BADGE_MAX,
  PLATFORM_KINDS,
  buildPlatformChange,
  clampBadge,
  emptyPlatformDraft,
  platformDirty,
  platformDraftFrom,
  platformErrors,
  platformWithLabel,
  type PlatformDraft,
  type PlatformKind,
} from './model'

/** Add (platform = null) or edit one platform. The key never changes after creation. */
export function PlatformEditor({
  config,
  platform,
  onClose,
}: {
  config: OrgConfig
  platform: Platform | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const a = t.adminOrg.platforms
  const id = useId()
  const [draft, setDraft] = useState<PlatformDraft>(() =>
    platform ? platformDraftFrom(platform) : emptyPlatformDraft(floorSwatches(config.palette)[0]?.key ?? ''),
  )
  const { status, issues: saveIssues, save, reset } = useConfigEdit()

  const errors = useMemo(() => platformErrors(draft, platform, config), [draft, platform, config])
  const change = useMemo(
    () => (errors.length === 0 ? buildPlatformChange(draft, platform) : null),
    [draft, platform, errors.length],
  )
  const { issues: draftIssues, blocking } = useDraftIssues(change)
  const baseline = useMemo(() => validateConfig(config), [config])
  const shown = saveIssues.length > 0 ? saveIssues : newIssues(draftIssues, baseline)
  const canSave = platformDirty(draft, platform) && errors.length === 0 && !blocking && change !== null

  useEffect(() => {
    if (status === 'saved') onClose()
  }, [status, onClose])

  const update = (patch: Partial<PlatformDraft>) => {
    reset()
    setDraft((d) => ({ ...d, ...patch }))
  }

  const swatches = floorSwatches(config.palette)
  const current = config.palette.find((s) => s.key === draft.swatch)
  const pickable = current && !swatches.includes(current) ? [current, ...swatches] : swatches
  const keyError = errors.includes('keyInvalid') && draft.key !== ''
    ? a.errors.keyInvalid
    : errors.includes('keyTaken')
      ? a.errors.keyTaken
      : null
  const badgeError = errors.includes('badgeRequired') && draft.badgeText !== '' ? a.errors.badgeRequired : null

  return (
    <EditorSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={platform ? fmt(a.editor.editTitle, { name: platform.label.vi }) : a.editor.addTitle}
      description={a.editor.description}
      issues={shown}
      status={status}
      canSave={canSave}
      onSave={() => {
        if (change) void save(change)
      }}
    >
      <LabelFields
        value={draft.label}
        onChange={(label) => {
          reset()
          setDraft((d) => platformWithLabel(d, label, config))
        }}
      />

      <Field label={t.admin.key.label} htmlFor={`${id}-key`} hint={platform ? undefined : t.admin.key.hint}>
        <Input
          id={`${id}-key`}
          value={draft.key}
          readOnly={platform !== null}
          disabled={platform !== null}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={keyError ? true : undefined}
          onChange={(e) => update({ key: e.target.value.trim(), keyTouched: true })}
        />
        {keyError && (
          <p role="alert" className="text-xs text-blocked">
            {keyError}
          </p>
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={a.editor.kind} htmlFor={`${id}-kind`}>
          <Select
            value={draft.kind}
            onValueChange={(v) => {
              const kind = PLATFORM_KINDS.find((k): k is PlatformKind => k === v)
              if (kind) update({ kind })
            }}
          >
            <SelectTrigger id={`${id}-kind`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORM_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {a.kinds[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={a.editor.badgeText} htmlFor={`${id}-badge`} hint={a.editor.badgeHint}>
          <Input
            id={`${id}-badge`}
            value={draft.badgeText}
            maxLength={BADGE_MAX}
            autoCapitalize="characters"
            aria-invalid={badgeError ? true : undefined}
            onChange={(e) => update({ badgeText: clampBadge(e.target.value) })}
          />
          {badgeError && (
            <p role="alert" className="text-xs text-blocked">
              {badgeError}
            </p>
          )}
        </Field>
      </div>

      <Field label={a.editor.badgeColor} htmlFor={`${id}-swatch`}>
        <SwatchPicker
          id={`${id}-swatch`}
          label={a.editor.badgeColor}
          swatches={pickable}
          value={draft.swatch}
          onChange={(swatch) => update({ swatch })}
        />
      </Field>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={`${id}-active`} className="text-sm font-medium">
            {a.editor.active}
          </label>
          <Switch
            id={`${id}-active`}
            checked={draft.active}
            onCheckedChange={(active) => update({ active })}
            aria-describedby={`${id}-active-hint`}
          />
        </div>
        <p id={`${id}-active-hint`} className="text-xs text-muted-foreground">
          {a.editor.activeHint}
        </p>
      </div>
    </EditorSheet>
  )
}

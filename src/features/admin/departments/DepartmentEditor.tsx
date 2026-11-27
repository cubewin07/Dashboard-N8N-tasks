import { useEffect, useId, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { Department, OrgConfig } from '@/domain/config'
import { validateConfig } from '@/domain/validateConfig'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { EditorSheet } from '../shared/EditorSheet'
import { Field, LabelFields } from '../shared/fields'
import { newIssues, useConfigEdit, useDraftIssues } from '../shared/useConfigEdit'
import { DEPARTMENT_ICONS, DEPARTMENT_ICON_NAMES } from './icons'
import {
  buildDepartmentChange,
  draftErrors,
  draftFrom,
  emptyDraft,
  floorSwatches,
  isDirty,
  withLabel,
  type DepartmentDraft,
  type DepartmentError,
} from './model'
import { SwatchPicker } from './SwatchPicker'

/** Add (department = null) or edit one department in a sheet. Mount it only while open. */
export function DepartmentEditor({
  config,
  department,
  onClose,
}: {
  config: OrgConfig
  department: Department | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const a = t.adminOrg.departments
  const id = useId()
  const [draft, setDraft] = useState<DepartmentDraft>(() =>
    department ? draftFrom(department) : emptyDraft(config),
  )
  const { status, issues: saveIssues, save, reset } = useConfigEdit()

  const errors = useMemo(() => draftErrors(draft, department, config), [draft, department, config])
  const change = useMemo(
    () => (errors.length === 0 ? buildDepartmentChange(draft, department, config) : null),
    [draft, department, config, errors.length],
  )
  const { issues: draftIssues, blocking } = useDraftIssues(change)
  const baseline = useMemo(() => validateConfig(config), [config])
  // The validator's "inactive department still has staff" error says what our own refusal
  // message already says next to the switch: show ours only.
  const shown = useMemo(
    () =>
      (saveIssues.length > 0 ? saveIssues : newIssues(draftIssues, baseline)).filter(
        (i) => (i.code as string) !== 'employeeInInactiveDepartment',
      ),
    [saveIssues, draftIssues, baseline],
  )

  const dirty = isDirty(draft, department)
  const canSave = dirty && errors.length === 0 && !blocking && change !== null

  // Close once saved; the optimistic config already shows the change.
  useEffect(() => {
    if (status === 'saved') onClose()
  }, [status, onClose])

  const update = (patch: Partial<DepartmentDraft>) => {
    reset()
    setDraft((d) => ({ ...d, ...patch }))
  }
  const errorText = (e: DepartmentError): string | null => {
    switch (e.code) {
      case 'keyInvalid':
        return draft.key === '' ? null : a.errors.keyInvalid
      case 'keyTaken':
        return a.errors.keyTaken
      case 'hasStaff':
        return fmt(a.errors.hasStaff, { n: e.n })
      case 'labelRequired':
        return null
    }
  }
  const keyError = errors.find((e) => e.code === 'keyInvalid' || e.code === 'keyTaken')
  const staffError = errors.find((e) => e.code === 'hasStaff')
  const swatches = floorSwatches(config.palette)
  const currentSwatch = config.palette.find((s) => s.key === draft.colorSwatch)
  const pickable = currentSwatch && !swatches.includes(currentSwatch) ? [currentSwatch, ...swatches] : swatches
  const icons = DEPARTMENT_ICON_NAMES.includes(draft.icon)
    ? DEPARTMENT_ICON_NAMES
    : [draft.icon, ...DEPARTMENT_ICON_NAMES]
  const title = department
    ? fmt(a.editor.editTitle, { name: department.label.vi })
    : a.editor.addTitle

  return (
    <EditorSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={title}
      description={a.editor.description}
      issues={shown}
      status={status}
      canSave={canSave}
      onSave={() => {
        if (change) void save(change)
      }}
    >
      <LabelFields value={draft.label} onChange={(label) => setDraft((d) => withLabel(d, label, config))} />

      <Field
        label={t.admin.key.label}
        htmlFor={`${id}-key`}
        hint={department ? undefined : t.admin.key.hint}
      >
        <Input
          id={`${id}-key`}
          value={draft.key}
          readOnly={department !== null}
          disabled={department !== null}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={keyError && errorText(keyError) ? true : undefined}
          aria-describedby={keyError && errorText(keyError) ? `${id}-key-error` : undefined}
          onChange={(e) => update({ key: e.target.value.trim(), keyTouched: true })}
        />
        {keyError && errorText(keyError) && (
          <p id={`${id}-key-error`} role="alert" className="text-xs text-blocked">
            {errorText(keyError)}
          </p>
        )}
      </Field>

      <Field label={a.editor.color} htmlFor={`${id}-color`}>
        <SwatchPicker
          id={`${id}-color`}
          label={a.editor.color}
          swatches={pickable}
          value={draft.colorSwatch}
          onChange={(colorSwatch) => update({ colorSwatch })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={a.editor.icon} htmlFor={`${id}-icon`}>
          <Select value={draft.icon} onValueChange={(icon) => update({ icon })}>
            <SelectTrigger id={`${id}-icon`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {icons.map((name) => {
                const Icon = DEPARTMENT_ICONS[name]
                return (
                  <SelectItem key={name} value={name}>
                    <span className="flex items-center gap-2">
                      {Icon && <Icon className="size-4" aria-hidden />}
                      {a.icons[name] ?? name}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </Field>

        <Field label={a.editor.hours} htmlFor={`${id}-hours`} hint={a.editor.hoursHint}>
          <Select
            value={draft.hours}
            onValueChange={(hours) => update({ hours: hours === '24_7' ? '24_7' : 'office' })}
          >
            <SelectTrigger id={`${id}-hours`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="office">{a.hours.office}</SelectItem>
              <SelectItem value="24_7">{a.hours['24_7']}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

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
        {staffError && errorText(staffError) && (
          <p role="alert" data-testid="department-refusal" className="text-sm text-blocked">
            {errorText(staffError)}
          </p>
        )}
      </div>
    </EditorSheet>
  )
}

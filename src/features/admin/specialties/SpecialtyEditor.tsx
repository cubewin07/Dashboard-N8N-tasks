import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import type { ConfigChange, Specialty } from '@/domain/config'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useConfig, useLabel } from '@/office/hooks'
import { NativeSelect } from '../people/NativeSelect'
import { useChangeIssues } from '../people/useChangeIssues'
import { EditorSheet } from '../shared/EditorSheet'
import { Field, LabelFields } from '../shared/fields'
import { KEY_PATTERN, slugKey, uniqueKey } from '../shared/keys'
import { useConfigEdit } from '../shared/useConfigEdit'
import {
  blankSpecialtyDraft,
  draftFromSpecialty,
  sameSpecialtyDraft,
  specialtyFromDraft,
  type SpecialtyDraft,
} from './specialtyModel'

/** Create (specialty = null) or rename / re-home one specialty. The key never changes. */
export function SpecialtyEditor({
  specialty,
  onClose,
}: {
  specialty: Specialty | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const s = t.adminPeople.specialties
  const label = useLabel()
  const { config } = useConfig()
  const baseId = useId()
  const { status, save } = useConfigEdit()

  const [initial] = useState<SpecialtyDraft>(() =>
    specialty ? draftFromSpecialty(specialty) : blankSpecialtyDraft(),
  )
  const [draft, setDraft] = useState<SpecialtyDraft>(initial)
  const [keyTouched, setKeyTouched] = useState(false)

  const existingKeys = useMemo(() => config?.specialties.map((x) => x.key) ?? [], [config])
  const key = specialty
    ? specialty.key
    : keyTouched
      ? draft.key
      : draft.label.vi.trim()
        ? uniqueKey(slugKey(draft.label.vi), existingKeys)
        : ''
  const keyError = specialty
    ? null
    : key === ''
      ? null
      : !KEY_PATTERN.test(key)
        ? s.keyInvalid
        : existingKeys.includes(key)
          ? s.keyTaken
          : null

  const change = useMemo<ConfigChange | null>(() => {
    if (keyError) return null
    const def = specialtyFromDraft({ ...draft, key })
    return def ? { kind: 'specialty.upsert', specialty: def } : null
  }, [draft, key, keyError])
  const { issues, blocking } = useChangeIssues(change)

  const set = <K extends keyof SpecialtyDraft>(k: K, v: SpecialtyDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  const dirty = !sameSpecialtyDraft({ ...draft, key }, initial)
  const canSave = change !== null && dirty && !blocking

  const departments = [...(config?.departments ?? [])]
    .filter((d) => d.active || d.key === draft.homeDepartmentKey)
    .sort((a, b) => a.order - b.order)

  const onSave = async () => {
    if (!change || change.kind !== 'specialty.upsert') return
    if (await save(change)) {
      toast.success(fmt(s.saved, { name: change.specialty.label.vi }))
      onClose()
    }
  }

  return (
    <EditorSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={specialty ? s.editTitle : s.addTitle}
      description={specialty ? s.editDescription : undefined}
      issues={issues}
      status={status}
      canSave={canSave}
      onSave={() => void onSave()}
    >
      <LabelFields value={draft.label} onChange={(l) => set('label', l)} />

      <Field label={s.fields.key} htmlFor={`${baseId}-key`} hint={keyError ?? t.admin.key.hint}>
        <Input
          id={`${baseId}-key`}
          value={key}
          readOnly={specialty !== null}
          disabled={specialty !== null}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={keyError ? true : undefined}
          onChange={(e) => {
            setKeyTouched(true)
            set('key', e.target.value)
          }}
        />
      </Field>

      <Field label={s.fields.home} htmlFor={`${baseId}-home`} hint={s.fields.homeHint}>
        <NativeSelect
          id={`${baseId}-home`}
          value={draft.homeDepartmentKey ?? ''}
          onChange={(e) => set('homeDepartmentKey', e.target.value || null)}
        >
          <option value="">{s.noHome}</option>
          {departments.map((d) => (
            <option key={d.key} value={d.key}>
              {label(d.label)}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label={s.fields.icon} htmlFor={`${baseId}-icon`} hint={s.fields.iconHint}>
        <Input
          id={`${baseId}-icon`}
          value={draft.icon}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={draft.icon.trim() === '' ? true : undefined}
          onChange={(e) => set('icon', e.target.value)}
        />
      </Field>
    </EditorSheet>
  )
}

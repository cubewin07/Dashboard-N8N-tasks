import { Lock } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label as FieldLabel } from '@/components/ui/label'
import type { ApprovalLevel, ConfigChange, ModelTier, RoleDef, WorkspaceKind } from '@/domain/config'
import { isBuiltInRole } from '@/domain/configChange'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useConfig } from '@/office/hooks'
import { NativeSelect } from '../people/NativeSelect'
import { useChangeIssues } from '../people/useChangeIssues'
import { EditorSheet } from '../shared/EditorSheet'
import { Field, LabelFields } from '../shared/fields'
import { KEY_PATTERN, slugKey, uniqueKey } from '../shared/keys'
import { useConfigEdit } from '../shared/useConfigEdit'
import {
  APPROVE_LEVELS,
  BOOLEAN_CAPS,
  CUSTOM_WORKSPACES,
  MODEL_TIERS,
  blankRoleDraft,
  draftFromRole,
  parseMaxPerDepartment,
  roleFromDraft,
  sameRoleDraft,
  type RoleDraft,
} from './roleModel'

/** Create (role = null) or edit one role. Built-ins keep a locked scope and `humanOwner`. */
export function RoleEditor({ role, onClose }: { role: RoleDef | null; onClose: () => void }) {
  const { t } = useI18n()
  const r = t.adminPeople.roles
  const { config } = useConfig()
  const baseId = useId()
  const { status, save } = useConfigEdit()
  const builtIn = role !== null && isBuiltInRole(role.key)

  const [initial] = useState<RoleDraft>(() => (role ? draftFromRole(role) : blankRoleDraft()))
  const [draft, setDraft] = useState<RoleDraft>(initial)
  // The key follows the Vietnamese name until the boss types in the key field (new roles only).
  const [keyTouched, setKeyTouched] = useState(false)

  const existingKeys = useMemo(() => config?.roles.map((x) => x.key) ?? [], [config])
  const key = role
    ? role.key
    : keyTouched
      ? draft.key
      : draft.label.vi.trim()
        ? uniqueKey(slugKey(draft.label.vi), existingKeys)
        : ''
  const keyError = role
    ? null
    : key === ''
      ? null
      : !KEY_PATTERN.test(key)
        ? r.keyInvalid
        : existingKeys.includes(key)
          ? r.keyTaken
          : null

  const effective: RoleDraft = { ...draft, key }
  const sortOrder = (config?.roles.reduce((m, x) => Math.max(m, x.sortOrder), -1) ?? -1) + 1
  const change = useMemo<ConfigChange | null>(() => {
    if (keyError) return null
    const def = roleFromDraft({ ...draft, key }, role, sortOrder)
    return def ? { kind: 'role.upsert', role: def } : null
  }, [draft, key, keyError, role, sortOrder])
  const { issues, blocking } = useChangeIssues(change)

  const set = <K extends keyof RoleDraft>(k: K, v: RoleDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const setCap = <K extends keyof RoleDraft['caps']>(k: K, v: RoleDraft['caps'][K]) =>
    setDraft((d) => ({ ...d, caps: { ...d.caps, [k]: v } }))

  const dirty = !sameRoleDraft(effective, initial)
  const canSave = change !== null && dirty && !blocking
  const maxInvalid = parseMaxPerDepartment(draft.maxPerDepartment) === 'invalid'

  const workspaces: WorkspaceKind[] = CUSTOM_WORKSPACES.includes(draft.workspace)
    ? [...CUSTOM_WORKSPACES]
    : [...CUSTOM_WORKSPACES, draft.workspace]

  const onSave = async () => {
    if (!change || change.kind !== 'role.upsert') return
    if (await save(change)) {
      toast.success(fmt(r.saved, { name: change.role.label.vi }))
      onClose()
    }
  }

  return (
    <EditorSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={role ? r.editTitle : r.addTitle}
      description={role ? r.editDescription : undefined}
      issues={issues}
      status={status}
      canSave={canSave}
      onSave={() => void onSave()}
    >
      {builtIn && (
        <p className="flex items-center gap-2 rounded-xl bg-surface-muted p-3 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" aria-hidden />
          {r.lock}
        </p>
      )}

      <LabelFields value={draft.label} onChange={(l) => set('label', l)} />

      <Field label={r.fields.key} htmlFor={`${baseId}-key`} hint={keyError ?? t.admin.key.hint}>
        <Input
          id={`${baseId}-key`}
          value={key}
          readOnly={role !== null}
          disabled={role !== null}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={keyError ? true : undefined}
          onChange={(e) => {
            setKeyTouched(true)
            set('key', e.target.value)
          }}
        />
      </Field>

      <Field label={r.fields.scope} htmlFor={`${baseId}-scope`} hint={r.fields.scopeHint}>
        <NativeSelect
          id={`${baseId}-scope`}
          value={draft.scope}
          disabled={builtIn}
          onChange={(e) => set('scope', e.target.value as RoleDef['scope'])}
        >
          <option value="department">{r.scope.department}</option>
          <option value="building">{r.scope.building}</option>
        </NativeSelect>
      </Field>

      <fieldset className="space-y-3">
        <legend className="mb-1.5 text-sm font-medium">{r.fields.caps}</legend>
        <ul className="space-y-3">
          {BOOLEAN_CAPS.map((cap) => {
            const id = `${baseId}-cap-${cap}`
            const locked = builtIn && cap === 'humanOwner'
            return (
              <li key={cap} className="flex items-start gap-3">
                <Checkbox
                  id={id}
                  className="mt-0.5"
                  checked={draft.caps[cap]}
                  disabled={locked}
                  aria-describedby={`${id}-hint`}
                  onCheckedChange={(v) => setCap(cap, v === true)}
                />
                <div className="space-y-0.5">
                  <FieldLabel htmlFor={id} className="cursor-pointer font-medium">
                    {r.caps[cap]}
                    {locked && <Lock className="ml-1.5 inline size-3.5 text-muted-foreground" aria-label={t.admin.locked} />}
                  </FieldLabel>
                  <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                    {r.caps[`${cap}Hint`]}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
        <Field label={r.fields.approveLevel} htmlFor={`${baseId}-approve`}>
          <NativeSelect
            id={`${baseId}-approve`}
            value={draft.caps.approveLevel ?? ''}
            onChange={(e) => setCap('approveLevel', (e.target.value || null) as ApprovalLevel | null)}
          >
            <option value="">{r.fields.approveNone}</option>
            {APPROVE_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {r.level[lvl]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={r.fields.modelTier} htmlFor={`${baseId}-tier`}>
          <NativeSelect
            id={`${baseId}-tier`}
            value={draft.modelTier}
            onChange={(e) => set('modelTier', e.target.value as ModelTier)}
          >
            {MODEL_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {t.adminPeople.people.modelTier[tier]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label={r.fields.maxPerDepartment}
          htmlFor={`${baseId}-max`}
          hint={r.fields.maxPerDepartmentHint}
        >
          <Input
            id={`${baseId}-max`}
            inputMode="numeric"
            value={draft.maxPerDepartment}
            aria-invalid={maxInvalid ? true : undefined}
            onChange={(e) => set('maxPerDepartment', e.target.value)}
          />
        </Field>
      </div>

      <Field label={r.fields.workspace} htmlFor={`${baseId}-workspace`}>
        <NativeSelect
          id={`${baseId}-workspace`}
          value={draft.workspace}
          onChange={(e) => set('workspace', e.target.value as WorkspaceKind)}
        >
          {workspaces.map((w) => (
            <option key={w} value={w}>
              {r.workspace[w]}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </EditorSheet>
  )
}

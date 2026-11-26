import { RotateCcw } from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label as FieldLabel } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Policy } from '@/domain/config'
import { ApprovalLevelSchema, type ApprovalLevel } from '@/domain/primitives'
import { validateConfig } from '@/domain/validateConfig'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useConfigStore } from '@/office/configStore'
import { IssueList } from '../shared/IssueList'
import { SaveStatusText } from '../shared/EditorSheet'
import { newIssues, useConfigEdit, useDraftIssues } from '../shared/useConfigEdit'
import {
  NUMBER_FIELDS,
  TIME_FIELDS,
  crossFieldErrors,
  invalidFieldIds,
  isPolicyDirty,
  isPolicyValid,
  isValidNumber,
  isValidTime,
  resetNumberField,
  resetTimeField,
  type NumberField,
  type PolicyGroup,
  type TimeField,
} from './model'

const LEVELS = ApprovalLevelSchema.options
const CHAINS = ['every_level_up_to_required', 'required_only'] as const

/** A labelled control with its hint, range and the per-field "Mặc định" reset. */
function PolicyField({
  id,
  label,
  hint,
  range,
  defaultText,
  atDefault,
  invalid,
  onReset,
  children,
}: {
  id: string
  label: string
  hint?: string
  range?: string
  defaultText: string
  atDefault: boolean
  invalid?: boolean
  onReset: () => void
  children: ReactNode
}) {
  const { t } = useI18n()
  const p = t.adminOrg.policy
  const notes = [hint, range].filter(Boolean).join(' ')
  return (
    <div className="space-y-1.5" data-policy-field={id}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-my-1 text-muted-foreground"
          disabled={atDefault}
          aria-label={fmt(p.resetField, { name: label })}
          onClick={onReset}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          {p.reset}
        </Button>
      </div>
      {children}
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {notes}
        {notes ? ' ' : ''}
        <span className="tabular">{defaultText}</span>
      </p>
      {invalid && (
        <p role="alert" className="text-xs text-blocked">
          {p.invalidField}
        </p>
      )}
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="rounded-[14px] border border-border bg-surface p-4 sm:p-5">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
      <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

/** Grouped policy form: one draft, one "Lưu" → `policy.set` (R6). */
export function PolicyForm({ saved, seed }: { saved: Policy; seed: Policy }) {
  const { t } = useI18n()
  const p = t.adminOrg.policy
  const uid = useId()
  const [draft, setDraft] = useState<Policy>(saved)
  // The saved policy changed underneath (restore, import, another browser): follow it unless the
  // boss has unsaved edits. Our own save lands here too and then draft already equals it.
  const [base, setBase] = useState<Policy>(saved)
  if (saved !== base) {
    setBase(saved)
    if (!isPolicyDirty(draft, base)) setDraft(saved)
  }
  const { status, issues: saveIssues, save, reset } = useConfigEdit()
  const config = useConfigStore((s) => s.config)

  const valid = isPolicyValid(draft)
  const dirty = isPolicyDirty(draft, saved)
  const change = useMemo(
    () => (valid ? ({ kind: 'policy.set', policy: draft } as const) : null),
    [valid, draft],
  )
  const { issues: draftIssues, blocking } = useDraftIssues(change)
  const baseline = useMemo(() => (config ? validateConfig(config) : []), [config])
  const shown = saveIssues.length > 0 ? saveIssues : newIssues(draftIssues, baseline)
  const cross = crossFieldErrors(draft)
  const badIds = new Set(invalidFieldIds(draft))
  const canSave = dirty && valid && !blocking && status !== 'saving'

  const edit = (next: Policy) => {
    reset()
    setDraft(next)
  }

  const numberField = (f: NumberField) => {
    const value = f.get(draft)
    const copy = t.adminOrg.policy.fields[f.id]
    const unit = p.units[f.unit]
    const id = `${uid}-${f.id}`
    return (
      <PolicyField
        key={f.id}
        id={id}
        label={copy.label}
        hint={copy.hint}
        range={fmt(p.rangeUnit, { min: f.min, max: f.max, unit })}
        defaultText={fmt(p.defaultValue, { value: `${f.get(seed)} ${unit}` })}
        atDefault={Object.is(value, f.get(seed))}
        invalid={!isValidNumber(f, value)}
        onReset={() => edit(resetNumberField(draft, seed, f))}
      >
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            step={1}
            min={f.min}
            max={f.max}
            value={Number.isNaN(value) ? '' : value}
            aria-describedby={`${id}-hint`}
            aria-invalid={!isValidNumber(f, value) ? true : undefined}
            className="max-w-40"
            onChange={(e) => edit(f.set(draft, e.target.value === '' ? Number.NaN : Number(e.target.value)))}
          />
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
      </PolicyField>
    )
  }

  const timeField = (f: TimeField) => {
    const value = f.get(draft)
    const copy = p.fields[f.id]
    const id = `${uid}-${f.id}`
    return (
      <PolicyField
        key={f.id}
        id={id}
        label={copy.label}
        defaultText={fmt(p.defaultValue, { value: f.get(seed) })}
        atDefault={value === f.get(seed)}
        invalid={!isValidTime(value)}
        onReset={() => edit(resetTimeField(draft, seed, f))}
      >
        <Input
          id={id}
          type="time"
          value={value}
          aria-describedby={`${id}-hint`}
          className="max-w-40"
          onChange={(e) => edit(f.set(draft, e.target.value))}
        />
      </PolicyField>
    )
  }

  const inGroup = (g: PolicyGroup) => NUMBER_FIELDS.filter((f) => f.group === g).map(numberField)
  const levelId = `${uid}-defaultLevel`
  const chainId = `${uid}-chain`
  const levelCopy = p.fields.defaultLevel
  const chainCopy = p.fields.chain

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave) void save({ kind: 'policy.set', policy: draft })
      }}
    >
      <p className="max-w-prose text-sm text-muted-foreground">{p.intro}</p>

      <Group title={p.groups.staffing.title} hint={p.groups.staffing.hint}>
        {inGroup('staffing')}
      </Group>
      <Group title={p.groups.help.title} hint={p.groups.help.hint}>
        {inGroup('help')}
      </Group>
      <Group title={p.groups.priority.title} hint={p.groups.priority.hint}>
        {inGroup('priority')}
      </Group>

      <Group title={p.groups.approvals.title} hint={p.groups.approvals.hint}>
        <PolicyField
          id={levelId}
          label={levelCopy.label}
          hint={levelCopy.hint}
          defaultText={fmt(p.defaultValue, { value: t.activity.levels[seed.approvals.defaultLevel] })}
          atDefault={draft.approvals.defaultLevel === seed.approvals.defaultLevel}
          onReset={() =>
            edit({ ...draft, approvals: { ...draft.approvals, defaultLevel: seed.approvals.defaultLevel } })
          }
        >
          <Select
            value={draft.approvals.defaultLevel}
            onValueChange={(v) => {
              const level = LEVELS.find((l): l is ApprovalLevel => l === v)
              if (level) edit({ ...draft, approvals: { ...draft.approvals, defaultLevel: level } })
            }}
          >
            <SelectTrigger id={levelId} aria-describedby={`${levelId}-hint`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {t.activity.levels[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PolicyField>

        <PolicyField
          id={chainId}
          label={chainCopy.label}
          defaultText={fmt(p.defaultValue, { value: chainCopy.options[seed.approvals.chain] })}
          atDefault={draft.approvals.chain === seed.approvals.chain}
          onReset={() => edit({ ...draft, approvals: { ...draft.approvals, chain: seed.approvals.chain } })}
        >
          <Select
            value={draft.approvals.chain}
            onValueChange={(v) => {
              const chain = CHAINS.find((c) => c === v)
              if (chain) edit({ ...draft, approvals: { ...draft.approvals, chain } })
            }}
          >
            <SelectTrigger id={chainId} aria-describedby={`${chainId}-hint`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHAINS.map((c) => (
                <SelectItem key={c} value={c}>
                  {chainCopy.options[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PolicyField>

        {inGroup('approvals')}
      </Group>

      <Group title={p.groups.calendar.title} hint={p.groups.calendar.hint}>
        {TIME_FIELDS.map(timeField)}
      </Group>

      <section className="rounded-[14px] border border-border bg-surface-muted/40 p-4 sm:p-5">
        <h2 className="text-base font-semibold">{p.groups.fixed.title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{p.groups.fixed.hint}</p>
        <dl className="mt-3 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
          {(['dropOrder', 'escalateTo', 'oneActive', 'timezone'] as const).map((k) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{p.fixed[k].label}</dt>
              <dd>{p.fixed[k].value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {cross.length > 0 && (
        <div role="alert" className="rounded-xl border border-blocked/40 bg-blocked-soft p-3 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            {cross.map((e) => (
              <li key={e}>{p.errors[e]}</li>
            ))}
          </ul>
        </div>
      )}
      <IssueList issues={shown} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!canSave} data-policy-save>
          {status === 'saving' ? t.admin.save.saving : t.admin.save.save}
        </Button>
        <SaveStatusText status={status} />
        {dirty && status === 'idle' && (
          <span className="text-sm text-muted-foreground">{p.unsaved}</span>
        )}
        {badIds.size > 0 && <span className="sr-only">{p.invalidField}</span>}
      </div>
    </form>
  )
}

import { Trash2 } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label as FieldLabel } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import type { ApprovalRule, OrgConfig } from '@/domain/config'
import type { ApprovalLevel } from '@/domain/primitives'
import { newIssues, useConfigEdit, useDraftIssues } from '../shared/useConfigEdit'
import { validateConfig } from '@/domain/validateConfig'
import { useI18n } from '@/i18n'
import { useLabel } from '@/office/hooks'
import { Field, LabelFields } from '../shared/fields'
import { EditorSheet } from '../shared/EditorSheet'
import {
  amountDigits,
  conditionCount,
  emptyRuleForm,
  formFromRule,
  formatAmountText,
  formsEqual,
  LEVELS,
  newRuleId,
  nextOrder,
  ruleFromForm,
  suggestTags,
  type CrossChoice,
  type RuleForm,
} from './ruleForm'
import { RuleTester } from './RuleTester'
import { TagInput } from './TagInput'
import type { Sample } from './testRule'

function CheckGroup({
  legend,
  options,
  value,
  onChange,
  empty,
  testId,
}: {
  legend: string
  options: readonly { value: string; label: string; hint?: string }[]
  value: readonly string[]
  onChange: (next: string[]) => void
  empty: string
  testId?: string
}) {
  const id = useId()
  const toggle = (v: string, on: boolean) => onChange(on ? [...value, v] : value.filter((x) => x !== v))
  return (
    <fieldset className="space-y-1.5" data-testid={testId}>
      <legend className="text-sm font-medium">{legend}</legend>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid max-h-48 gap-1 overflow-y-auto rounded-xl border border-border p-2 sm:grid-cols-2">
          {options.map((o, i) => (
            <div key={o.value} className="flex items-center gap-2 py-1">
              <Checkbox
                id={`${id}-${i}`}
                checked={value.includes(o.value)}
                onCheckedChange={(c) => toggle(o.value, c === true)}
              />
              <FieldLabel htmlFor={`${id}-${i}`} className="font-normal">
                {o.label}
                {o.hint && <span className="ml-1.5 text-xs text-muted-foreground">{o.hint}</span>}
              </FieldLabel>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  )
}

/**
 * Create / edit one approval rule (R7). `rules` is the saved list; `onDraft` reports the rule as
 * edited so the page tester can run against it before anything is saved.
 */
export function RuleEditor({
  config,
  rule,
  rules,
  sample,
  onSampleChange,
  onDraft,
  onClose,
  onDelete,
}: {
  config: OrgConfig
  /** null → a new rule. */
  rule: ApprovalRule | null
  rules: readonly ApprovalRule[]
  sample: Sample
  onSampleChange: (next: Sample) => void
  onDraft: (rule: ApprovalRule | null) => void
  onClose: () => void
  onDelete: (rule: ApprovalRule) => void
}) {
  const { t } = useI18n()
  const label = useLabel()
  const id = useId()
  const te = t.adminRules.editor
  const baseline = useMemo(() => (rule ? formFromRule(rule) : emptyRuleForm()), [rule])
  const [form, setForm] = useState<RuleForm>(baseline)
  const { status, issues: saveIssues, save } = useConfigEdit()
  const patch = (p: Partial<RuleForm>) => setForm((f) => ({ ...f, ...p }))

  const draft = useMemo(
    () =>
      ruleFromForm(form, {
        id: rule?.id ?? newRuleId(form.label, rules),
        order: rule?.order ?? nextOrder(rules),
      }),
    [form, rule, rules],
  )
  useEffect(() => {
    onDraft(draft)
  }, [draft, onDraft])
  useEffect(() => () => onDraft(null), [onDraft])

  const draftRules = useMemo(
    () => (rules.some((r) => r.id === draft.id) ? rules.map((r) => (r.id === draft.id ? draft : r)) : [...rules, draft]),
    [rules, draft],
  )

  const change = useMemo(() => ({ kind: 'rule.upsert' as const, rule: draft }), [draft])
  const { issues: draftIssues, blocking } = useDraftIssues(change)
  const baselineIssues = useMemo(() => validateConfig(config), [config])
  const fresh = useMemo(() => newIssues(draftIssues, baselineIssues), [draftIssues, baselineIssues])
  const shown = saveIssues.length > 0 ? saveIssues : fresh

  const dirty = !formsEqual(form, baseline)
  const hasLabel = form.label.vi.trim() !== ''
  const canSave = dirty && hasLabel && !blocking
  const conditions = conditionCount(draft.when)

  const onSave = () => {
    void save(change).then((ok) => {
      if (ok) onClose()
    })
  }

  const tags = useMemo(() => suggestTags(config.taskTypes, rules), [config.taskTypes, rules])
  const selectedOrActive = <T extends { active: boolean }>(
    items: readonly T[],
    keyOf: (item: T) => string,
    selected: readonly string[],
  ) => items.filter((x) => x.active || selected.includes(keyOf(x)))

  return (
    <EditorSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={rule ? te.titleEdit : te.titleNew}
      description={te.description}
      issues={shown}
      status={status}
      canSave={canSave}
      onSave={onSave}
      extraActions={
        rule && (
          <Button type="button" variant="outline" onClick={() => onDelete(rule)}>
            <Trash2 aria-hidden />
            {t.admin.delete}
          </Button>
        )
      }
    >
      <LabelFields value={form.label} onChange={(l) => patch({ label: l })} />
      {!hasLabel && dirty && <p className="text-sm text-blocked">{te.labelRequired}</p>}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
        <FieldLabel htmlFor={`${id}-enabled`}>{te.enabled}</FieldLabel>
        <Switch id={`${id}-enabled`} checked={form.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
      </div>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">{te.conditions}</legend>
        <p className="text-sm text-muted-foreground">{te.conditionsHint}</p>

        <CheckGroup
          legend={te.taskTypes}
          options={config.taskTypes.map((x) => ({ value: x.key, label: label(x.label), hint: x.key }))}
          value={form.taskTypes}
          onChange={(taskTypes) => patch({ taskTypes })}
          empty={te.noOptions}
          testId="rule-editor-tasktypes"
        />

        <TagInput
          label={te.tags}
          hint={te.tagsHint}
          value={form.tagsAny}
          onChange={(tagsAny) => patch({ tagsAny })}
          suggestions={tags}
          testId="rule-editor-tags"
        />

        <CheckGroup
          legend={te.platforms}
          options={selectedOrActive(config.platforms, (p) => p.key, form.platformsAny).map((p) => ({
            value: p.key,
            label: label(p.label),
          }))}
          value={form.platformsAny}
          onChange={(platformsAny) => patch({ platformsAny })}
          empty={te.noOptions}
        />

        <CheckGroup
          legend={te.departments}
          options={selectedOrActive(config.departments, (d) => d.key, form.departmentsAny).map((d) => ({
            value: d.key,
            label: label(d.label),
          }))}
          value={form.departmentsAny}
          onChange={(departmentsAny) => patch({ departmentsAny })}
          empty={te.noOptions}
        />

        <Field label={te.amount} htmlFor={`${id}-amount`} hint={te.amountHint}>
          <div className="flex items-center gap-2">
            <Input
              id={`${id}-amount`}
              inputMode="numeric"
              autoComplete="off"
              placeholder={te.amountPlaceholder}
              value={formatAmountText(form.amountText)}
              onChange={(e) => patch({ amountText: amountDigits(e.target.value) })}
            />
            <span className="text-sm text-muted-foreground">{te.vnd}</span>
          </div>
        </Field>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{te.cross}</legend>
          <RadioGroup
            value={form.cross}
            onValueChange={(v) => patch({ cross: v as CrossChoice })}
            className="sm:grid-cols-3"
          >
            {(['any', 'yes', 'no'] as const).map((choice) => (
              <div key={choice} className="flex items-center gap-2">
                <RadioGroupItem value={choice} id={`${id}-cross-${choice}`} />
                <FieldLabel htmlFor={`${id}-cross-${choice}`} className="font-normal">
                  {te.crossChoices[choice]}
                </FieldLabel>
              </div>
            ))}
          </RadioGroup>
        </fieldset>

        {conditions === 0 && (
          <p role="note" className="rounded-xl bg-waiting-soft p-3 text-sm text-waiting">
            {te.noConditions}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-base font-semibold">{te.level}</legend>
        <RadioGroup value={form.level} onValueChange={(v) => patch({ level: v as ApprovalLevel })}>
          {LEVELS.map((level) => (
            <div key={level} className="flex items-start gap-2">
              <RadioGroupItem value={level} id={`${id}-level-${level}`} className="mt-0.5" />
              <FieldLabel htmlFor={`${id}-level-${level}`} className="flex flex-col font-normal">
                <span className="font-medium">{t.adminRules.levels[level]}</span>
                <span className="text-xs text-muted-foreground">{te.levelHints[level]}</span>
              </FieldLabel>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      <p className="text-sm text-muted-foreground">{t.adminRules.rules.strictNote}</p>

      <RuleTester
        config={config}
        rules={draftRules}
        sample={sample}
        onSampleChange={onSampleChange}
        testId="rule-tester-draft"
        heading={te.testDraft}
        note={te.testDraftHint}
      />
    </EditorSheet>
  )
}

import { useId, useMemo, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label as FieldLabel } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ApprovalRule, OrgConfig } from '@/domain/config'
import { useI18n } from '@/i18n'
import { useLabel } from '@/office/hooks'
import { fmt } from '@/lib/utils'
import { Field } from '../shared/fields'
import { formatAmountText, amountDigits, suggestTags } from './ruleForm'
import { evaluateSample, sampleForType, type Sample } from './testRule'
import { TagInput } from './TagInput'

const NONE = '__none__'

function SelectField({
  id,
  value,
  onChange,
  options,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string }[]
}) {
  return (
    <Select value={value === '' ? NONE : value} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value === '' ? NONE : o.value} value={o.value === '' ? NONE : o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** "Cần: Sếp duyệt, vì quy tắc *Việc nhạy cảm*": the rule name is emphasised. */
function Reason({ template, level, rule }: { template: string; level: string; rule: string | null }) {
  const filled = fmt(template, { level })
  if (rule === null) return <>{filled}</>
  const [before = '', after = ''] = filled.split('{rule}')
  return (
    <>
      {before}
      <em className="font-semibold not-italic">{rule}</em>
      {after}
    </>
  )
}

/**
 * "Thử quy tắc" (R8): a sample task goes through `explainLevel`, the very function the engine
 * uses, against `rules` — the unsaved draft list while the editor is open.
 */
export function RuleTester({
  config,
  rules,
  sample,
  onSampleChange,
  testId,
  heading,
  note,
}: {
  config: OrgConfig
  rules: readonly ApprovalRule[]
  sample: Sample
  onSampleChange: (next: Sample) => void
  testId: string
  heading?: ReactNode
  note?: string
}) {
  const { t } = useI18n()
  const label = useLabel()
  const id = useId()
  const tt = t.adminRules.tester

  const result = useMemo(() => evaluateSample(config, rules, sample), [config, rules, sample])
  const suggestions = useMemo(() => suggestTags(config.taskTypes, rules), [config.taskTypes, rules])
  const { explained } = result

  const typeOptions = [
    { value: '', label: tt.typeNone },
    ...config.taskTypes.map((x) => ({ value: x.key, label: label(x.label) })),
  ]
  const platformOptions = [
    { value: '', label: tt.platformNone },
    ...config.platforms.filter((p) => p.active).map((p) => ({ value: p.key, label: label(p.label) })),
  ]
  const departmentOptions = config.departments
    .filter((d) => d.active || d.key === sample.departmentKey)
    .map((d) => ({ value: d.key, label: label(d.label) }))

  const levelName = t.adminRules.levels[explained.level]
  const decidingRule = !explained.defaulted && explained.decidedBy ? label(explained.decidedBy.label) : null
  const reasonText = decidingRule === null ? tt.reasonDefault : tt.reasonRule

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="space-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-4"
      data-testid={testId}
    >
      <div className="space-y-1">
        <h3 id={`${id}-title`} className="text-base font-semibold">
          {heading ?? tt.title}
        </h3>
        <p className="text-sm text-muted-foreground">{note ?? tt.hint}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tt.type} htmlFor={`${id}-type`} className="sm:col-span-2">
          <SelectField
            id={`${id}-type`}
            value={sample.typeKey}
            onChange={(v) => onSampleChange(v === '' ? { ...sample, typeKey: '' } : sampleForType(config, sample, v))}
            options={typeOptions}
          />
        </Field>
        <div className="sm:col-span-2">
          <TagInput
            label={tt.tags}
            hint={tt.tagsHint}
            value={sample.tags}
            onChange={(tags) => onSampleChange({ ...sample, tags })}
            suggestions={suggestions}
          />
        </div>
        <Field label={tt.platform} htmlFor={`${id}-platform`}>
          <SelectField
            id={`${id}-platform`}
            value={sample.platformKey}
            onChange={(platformKey) => onSampleChange({ ...sample, platformKey })}
            options={platformOptions}
          />
        </Field>
        <Field label={tt.department} htmlFor={`${id}-dept`}>
          <SelectField
            id={`${id}-dept`}
            value={sample.departmentKey}
            onChange={(departmentKey) => onSampleChange({ ...sample, departmentKey })}
            options={departmentOptions}
          />
        </Field>
        <Field label={tt.amount} htmlFor={`${id}-amount`}>
          <Input
            id={`${id}-amount`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={formatAmountText(sample.amountText)}
            onChange={(e) => onSampleChange({ ...sample, amountText: amountDigits(e.target.value) })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault()
            }}
          />
        </Field>
        <div className="flex items-end pb-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-cross`}
              checked={sample.crossDepartment}
              onCheckedChange={(v) => onSampleChange({ ...sample, crossDepartment: v === true })}
            />
            <FieldLabel htmlFor={`${id}-cross`}>{tt.cross}</FieldLabel>
          </div>
        </div>
      </div>

      <div
        role="status"
        aria-live="polite"
        className="space-y-3 rounded-xl bg-surface-muted p-3"
        data-testid={`${testId}-result`}
      >
        <p className="text-base font-semibold" data-testid={`${testId}-reason`}>
          <Reason
            template={reasonText}
            level={levelName}
            rule={decidingRule}
          />
        </p>

        <div className="space-y-1">
          <p className="text-sm font-medium">{tt.matched}</p>
          {explained.matchedRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tt.matchedNone}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {explained.matchedRules.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span>{label(r.label)}</span>
                  <Badge variant={r.level === 'boss' ? 'blocked' : r.level === 'dept_manager' ? 'waiting' : 'done'}>
                    {t.adminRules.levels[r.level]}
                  </Badge>
                  <code className="text-xs text-muted-foreground">{r.id}</code>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">{tt.chain}</p>
          {!result.departmentFound && <p className="text-sm text-muted-foreground">{tt.noDepartment}</p>}
          <ol className="space-y-1.5 text-sm" data-testid={`${testId}-chain`}>
            {result.chain.map((step, i) => (
              <li key={step.level} className="flex gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span>
                  <span className="font-medium">{t.adminRules.levels[step.level]}</span>
                  {': '}
                  {step.roles.every((r) => r.people.length === 0) ? (
                    <span className="text-muted-foreground">{tt.nobody}</span>
                  ) : (
                    step.roles
                      .filter((r) => r.people.length > 0)
                      .map((r) => `${label(r.roleLabel)} (${r.people.map((p) => p.name).join(', ')})`)
                      .join('; ')
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

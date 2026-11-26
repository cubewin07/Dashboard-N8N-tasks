// P10-T10 / T11 · Quy tắc duyệt: ordered rule list, condition builder sheet, rule tester panel.
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '@/components'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import type { ApprovalRule, OrgConfig } from '@/domain/config'
import { useI18n, type Messages } from '@/i18n'
import { useConfig, useLabel } from '@/office/hooks'
import { fmt } from '@/lib/utils'
import { ReorderButtons, moveId } from '../shared/fields'
import { SaveStatusText } from '../shared/EditorSheet'
import { useConfigEdit } from '../shared/useConfigEdit'
import { formatAmountText, sortRules } from '../rules/ruleForm'
import { RuleEditor } from '../rules/RuleEditor'
import { RuleTester } from '../rules/RuleTester'
import { emptySample, type Sample } from '../rules/testRule'

const LEVEL_BADGE = { reviewer: 'done', dept_manager: 'waiting', boss: 'blocked' } as const

/** One line per filled condition: "Có thẻ: tax, legal" … */
function conditionLines(
  rule: ApprovalRule,
  config: OrgConfig,
  t: Messages,
  label: (l: ApprovalRule['label']) => string,
): string[] {
  const s = t.adminRules.rules.summary
  const { when } = rule
  const names = <T,>(keys: readonly string[], items: readonly T[], keyOf: (x: T) => string, nameOf: (x: T) => string) =>
    keys.map((k) => {
      const item = items.find((x) => keyOf(x) === k)
      return item ? nameOf(item) : k
    })
  const lines: string[] = []
  if (when.taskTypes?.length)
    lines.push(
      fmt(s.taskTypes, {
        list: names(when.taskTypes, config.taskTypes, (x) => x.key, (x) => label(x.label)).join(', '),
      }),
    )
  if (when.tagsAny?.length) lines.push(fmt(s.tags, { list: when.tagsAny.join(', ') }))
  if (when.platformsAny?.length)
    lines.push(
      fmt(s.platforms, {
        list: names(when.platformsAny, config.platforms, (x) => x.key, (x) => label(x.label)).join(', '),
      }),
    )
  if (when.departmentsAny?.length)
    lines.push(
      fmt(s.departments, {
        list: names(when.departmentsAny, config.departments, (x) => x.key, (x) => label(x.label)).join(', '),
      }),
    )
  if (when.amountVndGte !== undefined)
    lines.push(fmt(s.amount, { amount: formatAmountText(String(when.amountVndGte)) }))
  if (when.crossDepartment !== undefined) lines.push(when.crossDepartment ? s.crossYes : s.crossNo)
  return lines
}

export function RulesTab() {
  const { config } = useConfig()
  if (!config) return null
  return <RulesPanel config={config} />
}

function RulesPanel({ config }: { config: OrgConfig }) {
  const { t } = useI18n()
  const label = useLabel()
  const tr = t.adminRules.rules
  const { status, save } = useConfigEdit()
  const rules = useMemo(() => sortRules(config.approvalRules), [config.approvalRules])

  const [editing, setEditing] = useState<{ rule: ApprovalRule | null } | null>(null)
  const [draft, setDraft] = useState<ApprovalRule | null>(null)
  const [toDelete, setToDelete] = useState<ApprovalRule | null>(null)
  const [sample, setSample] = useState<Sample>(() => emptySample(config))

  // What the tester reads: the saved rules, or the draft applied on top while the editor is open.
  const testRules = useMemo(() => {
    if (!editing || !draft) return rules
    return rules.some((r) => r.id === draft.id)
      ? rules.map((r) => (r.id === draft.id ? draft : r))
      : [...rules, draft]
  }, [rules, editing, draft])

  const ids = rules.map((r) => r.id)
  const busy = status === 'saving'

  const toggle = (rule: ApprovalRule, enabled: boolean) => {
    void save({ kind: 'rule.upsert', rule: { ...rule, enabled } })
  }
  const move = (index: number, delta: -1 | 1) => {
    void save({ kind: 'rule.reorder', ids: moveId(ids, index, delta) })
  }
  const confirmDelete = () => {
    const target = toDelete
    if (!target) return
    void save({ kind: 'rule.delete', id: target.id }).then((ok) => {
      if (!ok) return
      setToDelete(null)
      setEditing(null)
      setDraft(null)
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <section aria-labelledby="rules-list-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 id="rules-list-title" className="text-lg font-semibold">
              {t.admin.tabs.rules}
            </h2>
            <p className="text-sm text-muted-foreground">{tr.strictNote}</p>
          </div>
          <div className="flex items-center gap-3">
            <SaveStatusText status={status} />
            <Button type="button" onClick={() => setEditing({ rule: null })}>
              <Plus aria-hidden />
              {tr.add}
            </Button>
          </div>
        </div>

        {rules.length === 0 ? (
          <EmptyState title={tr.empty} description={tr.emptyHint} />
        ) : (
          <ol className="space-y-3" data-testid="rules-list">
            {rules.map((rule, index) => {
              const name = label(rule.label)
              const lines = conditionLines(rule, config, t, label)
              const switchId = `rule-enabled-${rule.id}`
              return (
                <li
                  key={rule.id}
                  data-rule-id={rule.id}
                  data-enabled={rule.enabled}
                  className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-4"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-muted-foreground"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className={rule.enabled ? 'font-medium' : 'font-medium text-muted-foreground'}>{name}</h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={LEVEL_BADGE[rule.level]}>
                          {fmt(tr.needs, { level: t.adminRules.levels[rule.level] })}
                        </Badge>
                        {!rule.enabled && <Badge>{tr.disabled}</Badge>}
                        <code className="text-xs text-muted-foreground">{rule.id}</code>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={switchId}
                        checked={rule.enabled}
                        disabled={busy}
                        aria-label={fmt(tr.toggle, { name })}
                        onCheckedChange={(v) => toggle(rule, v)}
                      />
                    </div>
                  </div>

                  {lines.length > 0 ? (
                    <ul className="space-y-0.5 text-sm text-muted-foreground">
                      {lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-waiting">{tr.summary.none}</p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ReorderButtons
                      name={name}
                      disabled={busy}
                      onUp={index > 0 ? () => move(index, -1) : null}
                      onDown={index < rules.length - 1 ? () => move(index, 1) : null}
                    />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditing({ rule })}>
                        <Pencil aria-hidden />
                        <span>{t.admin.edit}</span>
                        <span className="sr-only">{name}</span>
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setToDelete(rule)}>
                        <Trash2 aria-hidden />
                        <span>{t.admin.delete}</span>
                        <span className="sr-only">{name}</span>
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <div className="lg:sticky lg:top-4">
        <RuleTester
          config={config}
          rules={testRules}
          sample={sample}
          onSampleChange={setSample}
          testId="rule-tester"
          note={editing && draft ? t.adminRules.tester.usingDraft : undefined}
        />
      </div>

      {editing && (
        <RuleEditor
          key={editing.rule?.id ?? 'new'}
          config={config}
          rule={editing.rule}
          rules={rules}
          sample={sample}
          onSampleChange={setSample}
          onDraft={setDraft}
          onClose={() => {
            setEditing(null)
            setDraft(null)
          }}
          onDelete={setToDelete}
        />
      )}

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr.deleteTitle}</DialogTitle>
            <DialogDescription>
              {fmt(tr.deleteBody, { name: toDelete ? label(toDelete.label) : '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setToDelete(null)}>
              {t.admin.save.cancel}
            </Button>
            <Button type="button" variant="danger" disabled={busy} onClick={confirmDelete}>
              {tr.deleteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

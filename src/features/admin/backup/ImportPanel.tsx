import { useId, useMemo, useState, type ChangeEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label as FieldLabel } from '@/components/ui/label'
import type { OrgConfig } from '@/domain/config'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { IssueList } from '../shared/IssueList'
import { useConfigEdit } from '../shared/useConfigEdit'
import { summarizeImport } from './configDiff'
import { parseImport, type ImportResult } from './envelope'

type Loaded = { fileName: string; result: ImportResult }

/** Pick a file, see the problems or the diff, then confirm (R14). Nothing is applied before that. */
export function ImportPanel({ config }: { config: OrgConfig }) {
  const { t } = useI18n()
  const ti = t.adminRules.backup.import
  const id = useId()
  const { status, issues: saveIssues, save, reset } = useConfigEdit()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [reading, setReading] = useState(false)
  const [inputKey, setInputKey] = useState(0)

  const diff = useMemo(
    () => (loaded?.result.ok ? summarizeImport(config, loaded.result.merged) : null),
    [loaded, config],
  )

  const clear = () => {
    setLoaded(null)
    reset()
    setInputKey((k) => k + 1)
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    reset()
    if (!file) {
      setLoaded(null)
      return
    }
    setReading(true)
    try {
      const text = await file.text()
      setLoaded({ fileName: file.name, result: parseImport(text, config) })
    } catch {
      setLoaded({ fileName: file.name, result: { ok: false, reason: 'not_json', issues: [] } })
    } finally {
      setReading(false)
    }
  }

  const apply = async () => {
    if (!loaded?.result.ok) return
    const ok = await save({ kind: 'config.replace', config: loaded.result.config })
    if (ok) {
      toast.success(ti.applied)
      clear()
    }
  }

  const failure = loaded && !loaded.result.ok ? loaded.result : null
  const failureText =
    failure === null
      ? null
      : failure.reason === 'not_json'
        ? ti.notJson
        : failure.reason === 'not_config'
          ? ti.notConfig
          : failure.reason === 'newer_version'
            ? fmt(ti.newerVersion, { version: failure.version ?? '?' })
            : ti.problemsTitle

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <div className="space-y-1">
        <h3 id={`${id}-title`} className="text-base font-semibold">
          {ti.title}
        </h3>
        <p className="text-sm text-muted-foreground">{ti.description}</p>
      </div>

      <div className="space-y-1.5">
        <FieldLabel htmlFor={`${id}-file`}>{ti.file}</FieldLabel>
        <Input
          key={inputKey}
          id={`${id}-file`}
          type="file"
          accept=".json,application/json"
          className="h-auto py-2"
          data-testid="import-file"
          onChange={(e) => void onFile(e)}
        />
      </div>

      {reading && (
        <p role="status" className="text-sm text-muted-foreground">
          {ti.reading}
        </p>
      )}

      {failureText && (
        <div role="alert" className="space-y-2 rounded-xl border border-blocked/40 bg-blocked-soft p-3" data-testid="import-error">
          <p className="text-sm font-semibold text-blocked">{failureText}</p>
          {failure && <IssueList issues={failure.issues} />}
        </div>
      )}

      {diff && loaded?.result.ok && (
        <div className="space-y-3" data-testid="import-diff">
          <h4 className="text-sm font-semibold">{ti.diffTitle}</h4>
          {diff.empty ? (
            <p className="text-sm text-muted-foreground">{ti.noDiff}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {diff.collections
                .filter((c) => c.added.length + c.changed.length + c.removed.length > 0)
                .map((c) => (
                  <li key={c.collection} className="space-y-0.5">
                    <p className="font-medium">{t.adminRules.backup.collections[c.collection]}</p>
                    {c.added.length > 0 && (
                      <p className="text-done">
                        {fmt(ti.added, { count: c.added.length })}: {c.added.join(', ')}
                      </p>
                    )}
                    {c.changed.length > 0 && (
                      <p className="text-waiting">
                        {fmt(ti.changed, { count: c.changed.length })}: {c.changed.join(', ')}
                      </p>
                    )}
                    {c.removed.length > 0 && (
                      <p className="text-blocked">
                        {fmt(ti.removed, { count: c.removed.length })}: {c.removed.join(', ')}
                      </p>
                    )}
                  </li>
                ))}
              {diff.policy.length > 0 && (
                <li className="space-y-0.5">
                  <p className="font-medium">{t.adminRules.backup.collections.policy}</p>
                  <p className="text-waiting">
                    {ti.policyChanged}: {diff.policy.map((p) => p.path).join(', ')}
                  </p>
                </li>
              )}
            </ul>
          )}
          <IssueList issues={loaded.result.issues.filter((i) => i.level === 'warning')} />
          <IssueList issues={saveIssues} />
          <p className="text-xs text-muted-foreground">{ti.note}</p>
        </div>
      )}

      {loaded && (
        <div className="flex flex-wrap gap-2">
          {loaded.result.ok && (
            <Button type="button" disabled={diff?.empty === true || status === 'saving'} onClick={() => void apply()}>
              {status === 'saving' ? ti.applying : ti.apply}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={clear}>
            {ti.clear}
          </Button>
        </div>
      )}
    </section>
  )
}

// R14: boss-only, Supabase-only. Copies looks saved in this browser's localStorage to the
// backend once, then lists what happened per employee.
import { useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useConfigStore } from '@/office/configStore'
import { importLocalLooks, type ImportResult, type ImportStatus } from '@/office/appearanceStore'

export function ImportLocalLooks() {
  const { t } = useI18n()
  const text = t.settings.importLooks
  const employees = useConfigStore((s) => s.config?.employees)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)

  const run = async () => {
    setRunning(true)
    try {
      setResults(await importLocalLooks())
    } finally {
      setRunning(false)
    }
  }

  const nameOf = (id: string) => employees?.find((e) => e.id === id)?.name ?? id
  const label: Record<ImportStatus, string> = {
    imported: text.imported,
    exists: text.exists,
    failed: text.failed,
  }
  const count = (s: ImportStatus) => results?.filter((r) => r.status === s).length ?? 0

  return (
    <Card data-testid="import-local-looks">
      <CardHeader>
        <CardTitle>{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" onClick={() => void run()} disabled={running}>
          {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
          {running ? text.running : text.button}
        </Button>
        {results && (
          <div role="status" className="space-y-2 text-sm">
            {results.length === 0 ? (
              <p>{text.none}</p>
            ) : (
              <>
                <p>
                  {fmt(text.summary, {
                    imported: count('imported'),
                    exists: count('exists'),
                    failed: count('failed'),
                  })}
                </p>
                <ul aria-label={text.resultsLabel} className="divide-y divide-border rounded-lg border border-border">
                  {results.map((r) => (
                    <li key={r.employeeId} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate">{nameOf(r.employeeId)}</span>
                      <span className={r.status === 'failed' ? 'text-blocked' : 'text-muted-foreground'}>
                        {label[r.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

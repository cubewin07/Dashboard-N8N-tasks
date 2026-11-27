// P10-T15 · Sao lưu (R14): export the config, import it back with a diff, reset to the seed.
import { Download, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useConfig } from '@/office/hooks'
import { exportFileName, serializeConfigFile } from '../backup/envelope'
import { ImportPanel } from '../backup/ImportPanel'
import { ResetDialog } from '../backup/ResetDialog'

export function BackupTab() {
  const { t } = useI18n()
  const { config } = useConfig()
  const tb = t.adminRules.backup
  const [resetOpen, setResetOpen] = useState(false)
  if (!config) return null

  const download = () => {
    const exportedAt = new Date().toISOString()
    const name = exportFileName(exportedAt)
    const blob = new Blob([serializeConfigFile(config, exportedAt)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.append(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success(fmt(tb.export.done, { file: name }))
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{tb.title}</h2>
        <p className="text-sm text-muted-foreground">{tb.description}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="backup-export-title" className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <div className="space-y-1">
            <h3 id="backup-export-title" className="text-base font-semibold">
              {tb.export.title}
            </h3>
            <p className="text-sm text-muted-foreground">{tb.export.description}</p>
          </div>
          <Button type="button" onClick={download}>
            <Download aria-hidden />
            {tb.export.button}
          </Button>
        </section>

        <ImportPanel config={config} />

        <section aria-labelledby="backup-reset-title" className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 lg:col-span-2">
          <div className="space-y-1">
            <h3 id="backup-reset-title" className="text-base font-semibold">
              {tb.reset.title}
            </h3>
            <p className="text-sm text-muted-foreground">{tb.reset.description}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setResetOpen(true)}>
            <RotateCcw aria-hidden />
            {tb.reset.button}
          </Button>
        </section>
      </div>

      <ResetDialog open={resetOpen} onOpenChange={setResetOpen} />
    </div>
  )
}

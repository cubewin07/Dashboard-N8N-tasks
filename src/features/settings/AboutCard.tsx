import { Info, Stethoscope } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CONTRACT_VERSION } from '@/domain/contract'
import { useI18n } from '@/i18n'
import { APP_BUILD, APP_VERSION } from '@/lib/appInfo'
import { formatDateTime } from '@/lib/time'
import { fmt } from '@/lib/utils'
import { probeCapabilities } from '@/office/capabilities'
import { useDiagnostics } from '@/office/diagnostics'
import { officeExtensions } from '@/office/extensions'
import { getFeedKind } from '@/office/store'

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-foreground tabular-nums" title={String(value)}>{value}</dd>
    </div>
  )
}

/** Settings → Giới thiệu (R12): version, contract, credits, simulator link, Chẩn đoán. */
export function AboutCard({ full }: { full: boolean }) {
  const { t } = useI18n()
  const a = t.settings.about
  const feedKind = getFeedKind()

  return (
    <Card data-settings-about>
      <CardHeader>
        <div className="flex items-start gap-2.5 sm:items-center">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Info className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <CardTitle>{a.title}</CardTitle>
            <CardDescription className="text-xs sm:text-sm">{a.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="divide-y divide-border rounded-xl border border-border px-3.5">
          <Row label={a.version} value={APP_BUILD ? `${APP_VERSION} · ${APP_BUILD}` : APP_VERSION} />
          <Row label={a.contract} value={`v${CONTRACT_VERSION}`} />
          {full && feedKind ? <Row label={a.feed} value={a.feeds[feedKind]} /> : null}
        </dl>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/30 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t.credits.settingsCard.title}</p>
            <p className="text-xs text-muted-foreground">{t.credits.settingsCard.description}</p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link to="/credits" data-credits-link>
              {t.credits.settingsCard.open}
            </Link>
          </Button>
        </div>

        {full && officeExtensions.controlPanel ? (
          <div
            data-settings-simulator
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/30 p-3.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{a.simulatorTitle}</p>
              <p className="text-xs text-muted-foreground">{a.simulatorHelp}</p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to="/">{a.simulatorOpen}</Link>
            </Button>
          </div>
        ) : null}

        <Diagnostics />
      </CardContent>
    </Card>
  )
}

function Diagnostics() {
  const { t, lang } = useI18n()
  const d = t.settings.diagnostics
  const invalidEvents = useDiagnostics((s) => s.invalidEvents)
  const canvasErrors = useDiagnostics((s) => s.canvasErrors)
  const contextLosses = useDiagnostics((s) => s.contextLosses)
  const entries = useDiagnostics((s) => s.entries)
  const clear = useDiagnostics((s) => s.clear)
  const caps = probeCapabilities()

  return (
    <section aria-labelledby="diagnostics-title" className="space-y-3" data-diagnostics>
      <div className="flex items-start gap-2">
        <Stethoscope className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <h3 id="diagnostics-title" className="text-sm font-semibold text-foreground">
            {d.title}
          </h3>
          <p className="text-xs text-muted-foreground">{d.description}</p>
        </div>
      </div>

      <dl className="divide-y divide-border rounded-xl border border-border px-3.5">
        <Row label={d.invalidEvents} value={invalidEvents} />
        <Row label={d.canvasErrors} value={canvasErrors} />
        <Row label={d.contextLosses} value={contextLosses} />
        <Row label={d.webgl2} value={caps.webgl2 ? d.yes : d.no} />
        <Row label={d.maxTexture} value={caps.maxTextureSize ?? d.unknown} />
        <Row
          label={d.memory}
          value={caps.deviceMemoryGb === null ? d.unknown : fmt(d.memoryValue, { gb: caps.deviceMemoryGb })}
        />
        <Row label={d.cores} value={caps.cores ?? d.unknown} />
        {caps.renderer ? <Row label={d.gpu} value={caps.renderer} /> : null}
      </dl>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{d.recent}</p>
          {entries.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={clear}>
              {d.clear}
            </Button>
          ) : null}
        </div>
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">{d.none}</p>
        ) : (
          <ul className="space-y-1.5" data-diagnostics-entries>
            {entries.map((e, i) => (
              <li
                key={`${e.at}-${i}`}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium text-foreground">{d.kinds[e.kind]}</span>
                  <time dateTime={e.at} className="text-muted-foreground tabular-nums">
                    {formatDateTime(e.at, lang)}
                  </time>
                </div>
                <p className="mt-0.5 break-words font-mono text-[11px] text-muted-foreground">{e.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

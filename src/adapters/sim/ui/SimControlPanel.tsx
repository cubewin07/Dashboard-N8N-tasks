import { useCallback, useState, useSyncExternalStore } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useOffice } from '@/office'
import { useI18n } from '@/i18n'
import { formatDateTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { simControls, type SimSpeed } from '../controls'
import { SCENARIO_DESCRIPTORS } from '../scenarios'

const SPEED_OPTIONS: readonly SimSpeed[] = [0, 1, 30, 120] as const

function buildShareUrl(seed: string): string {
  if (typeof window === 'undefined') return ''
  try {
    const url = new URL(window.location.href)
    const hash = url.hash || '#/'
    const qIdx = hash.indexOf('?')
    const basePath = qIdx >= 0 ? hash.slice(0, qIdx) : hash
    const queryStr = qIdx >= 0 ? hash.slice(qIdx + 1) : ''
    const params = new URLSearchParams(queryStr)
    params.set('seed', seed)
    url.hash = `${basePath}?${params.toString()}`
    return url.toString()
  } catch {
    return window.location.href
  }
}

export interface SimControlPanelProps {
  className?: string
}

export function SimControlPanel({ className }: SimControlPanelProps = {}) {
  const { t, lang } = useI18n()
  const snapshot = useSyncExternalStore(
    simControls.subscribe,
    simControls.getSnapshot,
    simControls.getSnapshot,
  )

  const officeNow = useOffice((s) => s.state?.now)
  const simNow = officeNow ?? snapshot.simNow

  const [isExpanded, setIsExpanded] = useState(true)
  const [seedOverride, setSeedOverride] = useState<{
    seed: string
    value: string
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const seedInput =
    seedOverride?.seed === snapshot.seed ? seedOverride.value : snapshot.seed

  const handleCopyLink = useCallback(async () => {
    const targetUrl = buildShareUrl(snapshot.seed)
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(targetUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // Ignore clipboard write failure in unsupported environments
    }
  }, [snapshot.seed])

  const getSpeedLabel = (speed: SimSpeed): string => {
    switch (speed) {
      case 0:
        return t.sim.pause
      case 1:
        return '1×'
      case 30:
        return '30×'
      case 120:
        return '120×'
      default:
        return `${String(speed)}×`
    }
  }

  const mainScenarios = SCENARIO_DESCRIPTORS.filter((d) => d.group === 'main')
  const perfScenarios = SCENARIO_DESCRIPTORS.filter((d) => d.group === 'perf')

  return (
    <div
      data-sim-control-panel
      className={cn(
        'w-full max-w-sm rounded-2xl border border-border bg-surface/95 p-3.5 shadow-md backdrop-blur text-foreground text-xs',
        className,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between gap-2',
          isExpanded && 'border-b border-border/60 pb-2.5',
        )}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-foreground tracking-tight">
            {t.sim.panelTitle}
          </span>
          <time
            data-sim-time={simNow}
            dateTime={simNow}
            className="tabular text-xs text-muted-foreground"
          >
            {formatDateTime(simNow, lang)}
          </time>
        </div>
        <button
          type="button"
          data-sim-panel-toggle
          aria-expanded={isExpanded}
          aria-label={isExpanded ? t.sim.collapse : t.sim.expand}
          onClick={() => setIsExpanded((prev) => !prev)}
          className="inline-flex size-7 items-center justify-center rounded-lg border border-border bg-surface hover:bg-surface-muted text-muted-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="size-4" aria-hidden />
          ) : (
            <ChevronDown className="size-4" aria-hidden />
          )}
          <span className="sr-only">
            {isExpanded ? t.sim.collapse : t.sim.expand}
          </span>
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3.5">
          {/* Speed Controls */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t.sim.speedLabel}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {SPEED_OPTIONS.map((speed) => {
                const isCurrent = snapshot.speed === speed
                return (
                  <button
                    key={speed}
                    type="button"
                    data-sim-speed={String(speed)}
                    aria-pressed={isCurrent}
                    onClick={() => simControls.setSpeed(speed)}
                    className={cn(
                      'flex items-center justify-center rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                      isCurrent
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border bg-surface hover:bg-surface-muted text-foreground',
                    )}
                  >
                    {getSpeedLabel(speed)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Seed Controls */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t.sim.seedLabel}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                data-sim-seed-input
                aria-label={t.sim.seedLabel}
                value={seedInput}
                onChange={(e) =>
                  setSeedOverride({
                    seed: snapshot.seed,
                    value: e.target.value,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    simControls.setSeed(seedInput)
                  }
                }}
                className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
              <button
                type="button"
                data-sim-seed-apply
                onClick={() => {
                  simControls.setSeed(seedInput)
                  setSeedOverride(null)
                }}
                className="h-8 shrink-0 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
              >
                {t.sim.applySeed}
              </button>
              <button
                type="button"
                data-sim-copy-link
                onClick={handleCopyLink}
                className="h-8 shrink-0 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
              >
                {copied ? t.sim.copied : t.sim.copyLink}
              </button>
            </div>
          </div>

          {/* Demo Auto-Approve Toggle */}
          <div>
            <label
              htmlFor="sim-auto-approve-input"
              className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-lg border border-border bg-surface p-2 text-xs transition-colors hover:bg-surface-muted"
            >
              <span className="font-medium text-foreground">
                {t.sim.autoApproveBoss}
              </span>
              <input
                id="sim-auto-approve-input"
                type="checkbox"
                data-sim-auto-approve
                checked={snapshot.autoApproveBoss}
                aria-checked={snapshot.autoApproveBoss}
                onChange={() =>
                  simControls.setAutoApproveBoss(!snapshot.autoApproveBoss)
                }
                className="size-4 shrink-0 cursor-pointer rounded border-border accent-primary text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
            </label>
          </div>

          {/* Scenario Buttons */}
          <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t.sim.scenariosTitle}
            </div>

            {/* Main group */}
            <div className="space-y-1.5">
              {mainScenarios.map((d) => {
                const isTeamOffline =
                  d.key === 'team_offline' && !snapshot.teamOnline
                const isActive =
                  isTeamOffline || snapshot.lastScenario === d.key
                return (
                  <button
                    key={d.key}
                    type="button"
                    data-sim-scenario={d.key}
                    aria-pressed={isActive}
                    onClick={() => simControls.runScenario(d.key)}
                    className={cn(
                      'w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors',
                      isTeamOffline
                        ? 'border-blocked bg-blocked/10 font-medium text-blocked'
                        : isActive
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'border-border bg-surface hover:bg-surface-muted text-foreground',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{t.sim.scenarios[d.key]}</span>
                      {isTeamOffline && (
                        <span className="shrink-0 rounded bg-blocked/15 px-1.5 py-0.5 text-[10px] font-semibold text-blocked">
                          {t.common.team.offline}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Perf group */}
            {perfScenarios.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t.sim.perfGroupTitle}
                </div>
                {perfScenarios.map((d) => {
                  const isActive = snapshot.lastScenario === d.key
                  return (
                    <button
                      key={d.key}
                      type="button"
                      data-sim-scenario={d.key}
                      aria-pressed={isActive}
                      onClick={() => simControls.runScenario(d.key)}
                      className={cn(
                        'w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors',
                        isActive
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'border-border bg-surface hover:bg-surface-muted text-foreground',
                      )}
                    >
                      <span>{t.sim.scenarios[d.key]}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

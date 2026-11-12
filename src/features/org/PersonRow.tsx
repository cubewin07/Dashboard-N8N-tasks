import type { OrgPersonNode } from '@/domain/selectors'
import { pileFor } from '@/domain/selectors'
import type { OfficeState, PersonActivity, PersonRuntime } from '@/domain/work'
import { useI18n } from '@/i18n'
import { activityTone, toneClasses } from '@/lib/status'
import { cn, fmt } from '@/lib/utils'
import { useConfig, useLabel } from '@/office/hooks'

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase()
}

export interface PersonRowProps {
  node: OrgPersonNode
  activity: PersonActivity
  runtime?: PersonRuntime
  state?: OfficeState | null
  compact?: boolean
}

export function PersonRow({
  node,
  activity,
  runtime,
  state,
  compact = false,
}: PersonRowProps) {
  const { t } = useI18n()
  const label = useLabel()
  const { config } = useConfig()
  const activeConfig = state?.config ?? config

  const { employee, role, specialties } = node
  const modelTier = employee.modelTierOverride ?? role.modelTier
  const tone = toneClasses[activityTone[activity]]

  const resolvedRuntime = runtime ?? (state ? state.people[employee.id] : undefined)
  const currentTask =
    resolvedRuntime?.taskId && state?.tasks
      ? state.tasks[resolvedRuntime.taskId]
      : undefined

  const platformKey = resolvedRuntime?.platformKey ?? currentTask?.platformKey
  const platform =
    platformKey && activeConfig
      ? activeConfig.platforms.find((p) => p.key === platformKey)
      : undefined

  const pileCount = state ? pileFor(state, employee.id).length : 0
  const isApprover = role.caps.approveLevel !== null
  const showPileBadge = isApprover || pileCount > 0

  return (
    <div
      data-employee-id={employee.id}
      data-employee-activity={activity}
      className={cn(
        'flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-3 transition-colors sm:flex-row sm:items-center sm:justify-between',
        compact && 'p-2.5',
      )}
    >
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        <div
          aria-hidden
          style={{
            backgroundColor: 'var(--dept-soft)',
            color: 'var(--dept)',
          }}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-xs font-bold tracking-tight"
        >
          {getInitials(employee.name)}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">
              {employee.name}
            </span>
            <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {label(role.label)}
            </span>
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {employee.kind === 'core' ? t.org.kindCore : t.org.kindTemp}
            </span>
            {!role.caps.humanOwner && (
              <span
                title={t.org.modelTier[modelTier]}
                className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-1.5 rounded-full',
                    modelTier === 'strong' && 'bg-primary',
                    modelTier === 'standard' && 'bg-working',
                    modelTier === 'cheap' && 'bg-idle',
                  )}
                />
                <span>{t.org.modelTier[modelTier]}</span>
              </span>
            )}
            {platform && (
              <span
                data-platform-badge={platform.key}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[11px] font-semibold text-foreground"
              >
                <span>{platform.badge.text}</span>
                <span>{label(platform.label)}</span>
              </span>
            )}
          </div>

          {currentTask && (
            <p
              data-person-task
              className="truncate text-xs font-medium text-foreground"
            >
              {fmt(t.org.currentTaskPrefix, { title: currentTask.title })}
            </p>
          )}

          {!compact && specialties.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {specialties.map((spec) => (
                <span
                  key={spec.key}
                  style={{
                    backgroundColor: 'var(--dept-soft)',
                    color: 'var(--dept)',
                  }}
                  className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium"
                >
                  {label(spec.label)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 sm:shrink-0">
        {showPileBadge && (
          <span
            data-pile-count={pileCount}
            className="tabular inline-flex items-center rounded-full bg-waiting-soft px-2 py-0.5 text-[11px] font-semibold text-waiting"
          >
            {fmt(t.org.pileBadge, { n: pileCount })}
          </span>
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            tone.bg,
            tone.text,
          )}
        >
          <span
            aria-hidden
            className={cn(
              'size-2 rounded-full',
              tone.dot,
              activityTone[activity] === 'working' && 'animate-pulse-dot',
            )}
          />
          <span>{t.org.activity[activity]}</span>
        </span>
      </div>
    </div>
  )
}

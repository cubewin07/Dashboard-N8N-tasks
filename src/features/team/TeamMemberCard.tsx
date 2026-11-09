import { useState } from 'react'
import { ShieldAlert, Sparkles } from 'lucide-react'
import {
  CommandButton,
  EmployeeAvatar,
  StatusPill,
  WorkflowIcon,
} from '@/components'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import type { AutonomyMode, Tables } from '@/lib/database.types'
import { useI18n } from '@/i18n'
import { cn, fmt } from '@/lib/utils'
import { describeRiskyStep, type EmployeeTodayStats } from './teamUtils'

interface TeamMemberCardProps {
  employee: Tables<'employees'>
  workflowKeys: string[]
  riskySteps: Tables<'workflow_steps'>[]
  stats: EmployeeTodayStats
}

export function TeamMemberCard({
  employee,
  workflowKeys,
  riskySteps,
  stats,
}: TeamMemberCardProps) {
  const { t } = useI18n()
  const [dialogTarget, setDialogTarget] = useState<AutonomyMode | null>(null)

  const roleLabel = t.common.roles[employee.role_key as keyof typeof t.common.roles] ?? employee.role_key
  const hasRiskySteps = riskySteps.length > 0
  const isWorksAlone = employee.autonomy === 'works_alone'
  const switchId = `autonomy-switch-${employee.key}`

  return (
    <>
      <article className="flex flex-col justify-between gap-5 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4">
          {/* Header: avatar, name, role, current status pill */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <EmployeeAvatar ownerKey={employee.key} size="lg" status={employee.status} />
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold leading-snug text-foreground">{employee.name}</h2>
                <p className="truncate text-sm text-muted-foreground">{roleLabel}</p>
              </div>
            </div>
            <StatusPill kind="emp" status={employee.status} size="sm" />
          </div>

          {/* Scope bullets */}
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t.team.sections.scope}
            </h3>
            <ul role="list" className="flex flex-col gap-1.5 text-sm text-foreground">
              {employee.scope.map((scopeKey) => (
                <li key={scopeKey} className="flex items-start gap-2 leading-snug">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{t.team.scopes[scopeKey] ?? scopeKey}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Skills (workflows owned) */}
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t.team.sections.skills}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {workflowKeys.length > 0 ? (
                workflowKeys.map((wfKey) => {
                  const wfShort =
                    t.common.workflows[wfKey as keyof typeof t.common.workflows]?.short ?? wfKey
                  return (
                    <span
                      key={wfKey}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted/60 px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      <WorkflowIcon workflowKey={wfKey} className="size-3.5 text-muted-foreground" />
                      <span>{wfShort}</span>
                    </span>
                  )
                })
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted/60 px-2.5 py-1 text-xs font-medium text-foreground">
                  <Sparkles className="size-3.5 text-muted-foreground" aria-hidden />
                  <span>{t.team.receptionSkill}</span>
                </span>
              )}
            </div>
          </div>

          {/* Today's numbers */}
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t.team.sections.todayStats}
            </h3>
            <dl className="grid grid-cols-3 gap-2 rounded-xl border border-border/80 bg-surface-muted/40 p-3 text-center">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{t.team.stats.done}</dt>
                <dd className="tabular text-base font-semibold text-done">{stats.done}</dd>
              </div>
              <div className="flex flex-col gap-0.5 border-x border-border/70 px-2">
                <dt className="text-xs text-muted-foreground">{t.team.stats.failed}</dt>
                <dd className={cn('tabular text-base font-semibold', stats.failed > 0 ? 'text-blocked' : 'text-foreground')}>
                  {stats.failed}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{t.team.stats.avgTime}</dt>
                <dd className="tabular text-base font-semibold text-foreground">
                  {stats.avgMinutes !== null
                    ? fmt(t.team.stats.minutesUnit, { n: stats.avgMinutes })
                    : t.team.stats.noAvg}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Autonomy switch footer */}
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t.team.sections.autonomy}
            </span>
            {!hasRiskySteps && (
              <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {t.team.autonomy.noRiskySteps}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-surface-muted/30 px-3.5 py-2.5">
            <label
              htmlFor={switchId}
              className={cn(
                'text-xs font-medium transition-colors sm:text-sm',
                !isWorksAlone ? 'font-semibold text-foreground' : 'text-muted-foreground',
                !hasRiskySteps && 'opacity-60',
              )}
            >
              🔒 {t.team.autonomy.askFirst}
            </label>

            <Switch
              id={switchId}
              checked={isWorksAlone}
              disabled={!hasRiskySteps}
              aria-label={fmt(t.team.autonomy.switchAria, { name: employee.name })}
              onCheckedChange={(checked) => {
                if (!hasRiskySteps) return
                setDialogTarget(checked ? 'works_alone' : 'ask_first')
              }}
            />

            <label
              htmlFor={switchId}
              className={cn(
                'text-xs font-medium transition-colors sm:text-sm',
                isWorksAlone ? 'font-semibold text-primary' : 'text-muted-foreground',
                !hasRiskySteps && 'opacity-60',
              )}
            >
              🔓 {t.team.autonomy.worksAlone}
            </label>
          </div>

          {!hasRiskySteps && (
            <p className="text-xs text-muted-foreground">{t.team.autonomy.noRiskyStepsHint}</p>
          )}
        </div>
      </article>

      {/* Confirm autonomy change dialog */}
      <Dialog
        open={dialogTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDialogTarget(null)
        }}
      >
        <DialogContent>
          {dialogTarget === 'works_alone' ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {fmt(t.team.autonomy.confirmOnTitle, { name: employee.name })}
                </DialogTitle>
                <DialogDescription>
                  {t.team.autonomy.confirmOnDescription}
                </DialogDescription>
              </DialogHeader>

              <ul role="list" className="flex flex-col gap-2 rounded-xl border border-waiting/30 bg-waiting-soft/70 p-3.5 text-sm text-foreground">
                {riskySteps.map((step) => {
                  const wfName =
                    t.common.workflows[step.workflow_key as keyof typeof t.common.workflows]?.short ??
                    step.workflow_key
                  return (
                    <li key={`${step.workflow_key}-${step.key}`} className="flex items-start gap-2.5">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-waiting" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">
                          {describeRiskyStep(employee.name, step, t)}
                        </p>
                        <p className="text-xs text-muted-foreground">{wfName}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>

              <p className="text-xs text-muted-foreground">{t.team.autonomy.confirmOnNote}</p>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t.common.actions.cancel}</Button>
                </DialogClose>
                <CommandButton
                  type="set_autonomy"
                  payload={{ employee_key: employee.key, autonomy: 'works_alone' }}
                  variant="primary"
                  onApplied={() => setDialogTarget(null)}
                >
                  {t.team.autonomy.confirmOnAction}
                </CommandButton>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {fmt(t.team.autonomy.confirmOffTitle, { name: employee.name })}
                </DialogTitle>
                <DialogDescription>
                  {fmt(t.team.autonomy.confirmOffDescription, { name: employee.name })}
                </DialogDescription>
              </DialogHeader>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t.common.actions.cancel}</Button>
                </DialogClose>
                <CommandButton
                  type="set_autonomy"
                  payload={{ employee_key: employee.key, autonomy: 'ask_first' }}
                  variant="primary"
                  onApplied={() => setDialogTarget(null)}
                >
                  {t.team.autonomy.confirmOffAction}
                </CommandButton>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

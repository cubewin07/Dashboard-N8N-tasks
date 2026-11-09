import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Play } from 'lucide-react'
import type { StartWorkPreset } from '@/app/startWork'
import type { Tables } from '@/lib/database.types'
import type { CommandPayloads } from '@/lib/commands'
import { CommandButton } from '@/components'
import { Button } from '@/components/ui/button'
import { useLookups, useShops, useTasks, useWorkflows } from '@/hooks/queries'
import { useI18n } from '@/i18n'
import { cn, fmt } from '@/lib/utils'
import { StepIndicator, type WizardStep } from './StepIndicator'
import { WorkflowPicker, isStartable } from './WorkflowPicker'
import { WhereStep } from './WhereStep'
import { PreviewStep, type Availability } from './PreviewStep'

/** "task:146" → 146 */
export function parseTaskId(result: string | null): number | null {
  const m = result?.match(/^task:(\d+)$/)
  return m ? Number(m[1]) : null
}

/**
 * The 3-step Start-work wizard, shared by the global sheet and the /start page.
 * State lives here and starts fresh on every mount (the sheet remounts it each time it opens).
 */
export function StartWizard({
  preset = {},
  layout,
  onStarted,
}: {
  preset?: StartWorkPreset
  layout: 'sheet' | 'page'
  onStarted: (taskId: number | null) => void
}) {
  const { t } = useI18n()
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)

  const workflowsQ = useWorkflows()
  const shopsQ = useShops()
  const tasks = useTasks().data
  const { employee, workflow: workflowMap, stepsByWorkflow } = useLookups()

  const [step, setStep] = useState<WizardStep>(preset.workflowKey ? 1 : 0)
  const [workflowKey, setWorkflowKey] = useState<string | null>(preset.workflowKey ?? null)
  const [shopId, setShopId] = useState<number | null>(preset.shopId ?? null)
  const [brief, setBrief] = useState('')
  // null = follow the default from the risky step owner's autonomy.
  const [approvalChoice, setApprovalChoice] = useState<boolean | null>(null)

  const workflows = workflowsQ.data ?? []
  const shops = useMemo(() => (shopsQ.data ?? []).filter((s) => s.active), [shopsQ.data])

  const selected = workflowKey ? workflowMap.get(workflowKey) : undefined
  const validWorkflow = selected && isStartable(selected) ? selected.key : null
  const validShop = shopId !== null && shops.some((s) => s.id === shopId) ? shopId : null
  // A preset pointing at a workflow that can't start falls back to step ①.
  const current: WizardStep = step > 0 && workflowsQ.isSuccess && !validWorkflow ? 0 : step

  const steps = useMemo(() => (validWorkflow ? (stepsByWorkflow.get(validWorkflow) ?? []) : []), [stepsByWorkflow, validWorkflow])
  const hasApprovalStep = steps.some((s) => s.kind === 'approval')
  const defaultApproval = useMemo(() => {
    const risky = steps.find((s) => s.risky)
    if (!risky || risky.owner_key === 'boss') return true
    return employee.get(risky.owner_key)?.autonomy !== 'works_alone'
  }, [steps, employee])
  const requireApproval = hasApprovalStep && (approvalChoice ?? defaultApproval)

  const availability = useMemo<Availability | null>(() => {
    const first = steps[0]
    if (!first || first.owner_key === 'boss') return null
    const emp = employee.get(first.owner_key)
    if (!emp) return null
    if (emp.status === 'idle') return { name: emp.name, free: true, ahead: 0 }
    const firstOwnerOf = (wf: string) => stepsByWorkflow.get(wf)?.[0]?.owner_key
    const queued = (tasks ?? []).filter((task: Tables<'tasks'>) => task.status === 'queued' && firstOwnerOf(task.workflow_key) === emp.key).length
    return { name: emp.name, free: false, ahead: queued + 1 }
  }, [steps, employee, stepsByWorkflow, tasks])

  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) headingRef.current?.focus()
    mounted.current = true
  }, [current])

  const pickWorkflow = (key: string) => {
    if (key !== workflowKey) setApprovalChoice(null)
    setWorkflowKey(key)
  }

  const canContinue = current === 0 ? Boolean(validWorkflow) : current === 1 ? validShop !== null : true
  const hint = current === 0 && !canContinue ? t.start.continueHint.what : current === 1 && !canContinue ? t.start.continueHint.where : null

  const payload: CommandPayloads['start_task'] | null =
    validWorkflow && validShop !== null
      ? { workflow_key: validWorkflow, shop_id: validShop, ...(brief.trim() ? { brief: brief.trim() } : {}), require_approval: requireApproval }
      : null

  const headings = [t.start.what.heading, t.start.where.heading, t.start.preview.heading]
  const shop = validShop !== null ? shops.find((s) => s.id === validShop) : undefined
  const wfName = validWorkflow ? (t.common.workflows[validWorkflow as keyof typeof t.common.workflows]?.name ?? selected?.name ?? '') : ''

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('flex flex-1 flex-col gap-5', layout === 'sheet' ? 'px-4 py-5 sm:px-6' : 'p-4 sm:p-5')}>
        <StepIndicator current={current} onJump={setStep} />

        <section aria-labelledby={headingId} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-base font-semibold text-foreground outline-none sm:text-lg">
              {headings[current]}
            </h2>
            {current === 0 && <p className="text-sm text-muted-foreground">{t.start.what.hint}</p>}
            {current > 0 && wfName && (
              <p className="text-sm text-muted-foreground">{shop && current === 2 ? fmt(t.start.preview.summary, { workflow: wfName, shop: `${shop.name} · ${t.common.platform[shop.platform]}` }) : wfName}</p>
            )}
          </div>

          {current === 0 && <WorkflowPicker workflows={workflows} loading={workflowsQ.isPending} value={validWorkflow} onChange={pickWorkflow} labelledBy={headingId} />}
          {current === 1 && (
            <WhereStep
              workflowKey={validWorkflow}
              shops={shops}
              loading={shopsQ.isPending}
              shopId={validShop}
              onShopChange={setShopId}
              brief={brief}
              onBriefChange={setBrief}
              hasApprovalStep={hasApprovalStep}
              requireApproval={requireApproval}
              onRequireApprovalChange={setApprovalChoice}
            />
          )}
          {current === 2 && <PreviewStep steps={steps} employees={employee} requireApproval={requireApproval} brief={brief} availability={availability} />}
        </section>
      </div>

      <div
        className={cn(
          'flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3',
          layout === 'sheet' ? 'sticky bottom-0 z-10 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6' : 'rounded-b-[var(--radius-card)] sm:px-5',
        )}
      >
        <div className="min-w-0">
          {current > 0 ? (
            <Button variant="ghost" onClick={() => setStep((current - 1) as WizardStep)}>
              <ArrowLeft aria-hidden />
              {t.common.actions.back}
            </Button>
          ) : (
            <p aria-live="polite" className="truncate text-sm text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-3">
          {current === 1 && hint && (
            <p aria-live="polite" className="hidden truncate text-sm text-muted-foreground sm:block">
              {hint}
            </p>
          )}
          {current < 2 ? (
            <Button disabled={!canContinue} onClick={() => setStep((current + 1) as WizardStep)}>
              {t.common.actions.next}
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            payload && (
              <CommandButton type="start_task" payload={payload} icon={Play} onApplied={(cmd) => onStarted(parseTaskId(cmd.result))}>
                {t.start.submit}
              </CommandButton>
            )
          )}
        </div>
      </div>
    </div>
  )
}

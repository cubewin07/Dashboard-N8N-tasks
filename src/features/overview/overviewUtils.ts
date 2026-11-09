import type { AutonomyMode, OwnerKey, Tables } from '@/lib/database.types'
import type { Lang } from '@/i18n'
import type { Messages } from '@/i18n/vi'
import { fmt } from '@/lib/utils'

function lowerFirst(s: string) {
  if (!s) return s
  return s.charAt(0).toLowerCase() + s.slice(1)
}

export function buildEmployeeDoingLine(
  emp: Tables<'employees'>,
  task: Tables<'tasks'> | undefined,
  shopName: string | undefined,
  t: Messages,
  lang: Lang,
): string {
  if (emp.status === 'idle' || !emp.current_task_id || !task) {
    return t.overview.teamSection.idleLine
  }
  const rawStep = emp.current_step_key
    ? (t.common.steps[emp.current_step_key] ?? emp.current_step_key)
    : (t.common.workflows[task.workflow_key as keyof typeof t.common.workflows]?.short ?? task.workflow_key)

  const shop = shopName ?? `#${task.shop_id}`
  if (emp.status === 'working') {
    const step = lang === 'vi' ? lowerFirst(rawStep) : rawStep
    return fmt(t.overview.teamSection.doingWorking, { step, shop, id: task.id })
  }
  if (emp.status === 'waiting_boss') return fmt(t.overview.teamSection.doingWaiting, { shop, id: task.id })
  if (emp.status === 'blocked') return fmt(t.overview.teamSection.doingBlocked, { step: `“${rawStep}”`, shop, id: task.id })
  return fmt(t.overview.teamSection.doingOther, { step: rawStep, shop, id: task.id })
}

const BARE_TASK_REF = /^#\d+$/

export function formatEventMessage(
  event: Tables<'events'>,
  t: Messages,
  employeeMap: Map<string, Tables<'employees'>>,
): string {
  const isObj = event.data !== null && typeof event.data === 'object' && !Array.isArray(event.data)
  const hasBareRefMessage = !event.message || BARE_TASK_REF.test(event.message.trim())
  if (!isObj && !hasBareRefMessage) {
    return event.message
  }
  const data = (isObj ? event.data : {}) as Record<string, unknown>
  const stepKey = typeof data.step_key === 'string' ? data.step_key : null
  const stepLabel = stepKey ? (t.common.steps[stepKey] ?? stepKey) : ''
  const id = event.task_id ?? ''
  const tpl = t.overview.activity.templates

  switch (event.type) {
    case 'step_started':
      return stepLabel ? fmt(tpl.step_started, { step: stepLabel, id }) : event.message
    case 'step_done':
      return stepLabel ? fmt(tpl.step_done, { step: stepLabel, id }) : event.message
    case 'step_failed':
      return stepLabel ? fmt(tpl.step_failed, { step: stepLabel, id }) : event.message
    case 'task_created':
      return fmt(tpl.task_created, { id })
    case 'task_done':
      return fmt(tpl.task_done, { id })
    case 'task_cancelled':
      return fmt(tpl.task_cancelled, { id })
    case 'approval_requested':
      return fmt(tpl.approval_requested, { id })
    case 'approved':
      return fmt(tpl.approved, { id })
    case 'rejected':
      return fmt(tpl.rejected, { id })
    case 'changes_requested':
      return fmt(tpl.changes_requested, { id })
    case 'answered':
      return fmt(tpl.answered, { id })
    case 'blocked':
      return fmt(tpl.blocked, { id })
    case 'question':
      return fmt(tpl.question, { id })
    case 'autonomy_changed': {
      const mode = (typeof data.autonomy === 'string' ? data.autonomy : 'ask_first') as AutonomyMode
      const modeLabel = t.common.autonomy[mode] ?? mode
      return fmt(tpl.autonomy_changed, { autonomy: modeLabel })
    }
    case 'reassigned': {
      const toKey = typeof data.to === 'string' ? (data.to as OwnerKey) : 'thu'
      const toName = toKey === 'boss' ? t.common.you : (employeeMap.get(toKey)?.name ?? toKey)
      return fmt(tpl.reassigned, { id, to: toName })
    }
    case 'retry':
      return fmt(tpl.retry, { id })
    default:
      return !hasBareRefMessage ? event.message : fmt(tpl.fallback, { id })
  }
}

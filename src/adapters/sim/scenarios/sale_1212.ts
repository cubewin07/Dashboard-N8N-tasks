import { pickHelper } from '@/domain/help'
import type { HelpRequest } from '@/domain/work'
import { simId } from '../rng'
import { stepAssignments, stepWorkers } from '../brain/agents'
import {
  createTaskInBrain,
  emitSimEvent,
  departmentIdByKey,
  departmentWorkers,
  getDeptManagerEmployeeId,
  getManagerEmployeeId,
  type SimBrainContext,
} from '../brain/context'

export function runSale1212Scenario(ctx: SimBrainContext): void {
  const nowMs = ctx.clock.nowMs()
  const managerId = getManagerEmployeeId(ctx)
  const marketingDept = departmentIdByKey(ctx, 'marketing')
  const designDept = departmentIdByKey(ctx, 'design')
  const csDept = departmentIdByKey(ctx, 'cs')
  emitSimEvent(ctx, 'sim.scenario', {
    key: 'sale_1212',
    label: {
      vi: 'Chiến dịch sale 12.12',
      en: '12.12 Mega Sale campaign',
    },
  })

  const eventLabel = 'Siêu Sale 12.12'

  // 1. mkt.campaign_plan
  const campaignTask = createTaskInBrain(ctx, 'mkt.campaign_plan', {
    requestedByKind: 'manager',
    channel: 'internal',
    priority: 'urgent',
    departmentId: marketingDept,
    platformKey: 'shopee',
    titleCtx: { event: eventLabel, shop: 'Shopee 1' },
    actor: managerId,
  })

  // 2. 4 Design tasks (with handoff from campaignTask)
  const designKeys = [
    'design.banner_set',
    'design.shop_decor',
    'design.short_video',
    'design.post_image',
  ] as const

  const designMgrId = getDeptManagerEmployeeId(ctx, designDept)
  for (let i = 0; i < designKeys.length; i += 1) {
    const dKey = designKeys[i]!
    const dTask = createTaskInBrain(ctx, dKey, {
      requestedByKind: i === 0 ? 'employee' : 'manager',
      channel: 'internal',
      priority: 'high',
      departmentId: designDept,
      platformKey: 'shopee',
      parentTaskId: i === 0 ? campaignTask.id : null,
      crossDepartment: i === 0,
      titleCtx: { event: eventLabel, shop: `Shopee ${(i % 3) + 1}` },
      actor: managerId,
    })
    if (i === 0) {
      emitSimEvent(
        ctx,
        'task.handed_off',
        {
          taskId: campaignTask.id,
          fromId: managerId,
          toId: designMgrId,
          newTaskId: dTask.id,
        },
        { actor: managerId },
      )
    }
  }

  // 3. 3 Marketing tasks
  const mktKeys = ['mkt.promo_join', 'mkt.voucher', 'mkt.post_fb'] as const
  for (const mKey of mktKeys) {
    createTaskInBrain(ctx, mKey, {
      requestedByKind: 'manager',
      channel: 'internal',
      priority: 'high',
      departmentId: marketingDept,
      titleCtx: { event: eventLabel, shop: 'Shopee 1' },
      actor: managerId,
    })
  }

  // 4. 2 CS tasks
  const csKeys = ['cs.chat_faq', 'cs.chat_size'] as const
  for (const cKey of csKeys) {
    createTaskInBrain(ctx, cKey, {
      requestedByKind: 'customer',
      channel: 'platform',
      priority: 'high',
      departmentId: csDept,
      titleCtx: { event: eventLabel, shop: 'Shopee 1' },
    })
  }

  // Assign and start tasks across the 3 floors
  stepAssignments(ctx)
  stepWorkers(ctx, 60_000)

  // Trigger a cross-department help request for campaignTask
  const requesterId = departmentWorkers(ctx, marketingDept)[0]!
  const helperId = pickHelper('image', ctx.state, [requesterId])
  const timeoutMs = ctx.state.config.policy.help.timeoutMinutes * 60_000
  const help: HelpRequest = {
    id: simId('help', ctx.rng, nowMs),
    taskId: campaignTask.id,
    fromId: requesterId,
    specialty: 'image',
    toId: helperId,
    round: 1,
    status: 'open',
    createdAt: ctx.clock.now(),
    timeoutAt: new Date(nowMs + timeoutMs).toISOString(),
  }
  emitSimEvent(ctx, 'help.requested', { help }, { actor: requesterId })
}

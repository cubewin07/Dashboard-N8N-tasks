import { BOSS_MESSAGES_VI } from '../content/vi'
import { chance, pick, simId } from '../rng'
import { stepAssignments, stepWorkers } from '../brain/agents'
import {
  createTaskInBrain,
  emitSimEvent,
  getManagerEmployeeId,
  getPrimaryOwnerEmployeeId,
  type SimBrainContext,
} from '../brain/context'

export function runBossTelegramScenario(ctx: SimBrainContext): void {
  const nowMs = ctx.clock.nowMs()
  const ownerId = getPrimaryOwnerEmployeeId(ctx)
  const managerId = getManagerEmployeeId(ctx)

  emitSimEvent(ctx, 'sim.scenario', {
    key: 'boss_telegram',
    label: {
      vi: 'Sếp nhắn Telegram',
      en: 'Boss Telegram message',
    },
  })

  const msg = pick(ctx.rng, BOSS_MESSAGES_VI)
  emitSimEvent(
    ctx,
    'intake.received',
    {
      messageId: simId('msg', ctx.rng, nowMs),
      channel: 'telegram',
      modality: chance(ctx.rng, 0.5) ? 'voice' : 'text',
      fromUserId: ownerId,
      text: msg.text,
    },
    { actor: ownerId },
  )

  createTaskInBrain(ctx, msg.typeKey, {
    requestedByKind: 'boss',
    requestedById: ownerId,
    channel: 'telegram',
    priority: msg.priority,
    departmentId: msg.departmentId,
    platformKey: msg.platformKey,
    actor: managerId,
  })

  if (chance(ctx.rng, 0.5)) {
    const secondMsg = pick(ctx.rng, BOSS_MESSAGES_VI)
    createTaskInBrain(ctx, secondMsg.typeKey, {
      requestedByKind: 'boss',
      requestedById: ownerId,
      channel: 'telegram',
      priority: secondMsg.priority,
      departmentId: secondMsg.departmentId,
      platformKey: secondMsg.platformKey,
      actor: managerId,
    })
  }

  stepAssignments(ctx)
  stepWorkers(ctx, 30_000)
}

import { flushOfflineCommands } from '../brain/commands'
import { emitSimEvent, type SimBrainContext } from '../brain/context'

export function runTeamOfflineScenario(ctx: SimBrainContext): void {
  emitSimEvent(ctx, 'sim.scenario', {
    key: 'team_offline',
    label: {
      vi: 'Đội offline',
      en: 'Team offline',
    },
  })
  ctx.teamOnline = !ctx.teamOnline
  if (ctx.teamOnline) {
    flushOfflineCommands(ctx)
    ctx.lastHeartbeatSimMs = ctx.clock.nowMs()
    emitSimEvent(ctx, 'system.heartbeat', {
      source: 'sim',
      version: '1.0.0',
    })
  }
}

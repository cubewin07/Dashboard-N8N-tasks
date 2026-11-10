import type { SimBrainContext } from '../brain/context'
import type { ScenarioKey } from '../controls'
import { runAngryRefundScenario } from './angry_refund'
import { runBossTelegramScenario } from './boss_telegram'
import { runCrowdedScenario } from './crowded'
import { runHireTempsScenario } from './hire_temps'
import { runLongQueueScenario } from './long_queue'
import { runMonthEndScenario } from './month_end'
import { runSale1212Scenario } from './sale_1212'
import { runTeamOfflineScenario } from './team_offline'

export interface ScenarioDescriptor {
  key: ScenarioKey
  group: 'main' | 'perf'
}

export const SCENARIO_DESCRIPTORS: readonly ScenarioDescriptor[] = [
  { key: 'angry_refund', group: 'main' },
  { key: 'sale_1212', group: 'main' },
  { key: 'month_end', group: 'main' },
  { key: 'long_queue', group: 'main' },
  { key: 'hire_temps', group: 'main' },
  { key: 'team_offline', group: 'main' },
  { key: 'boss_telegram', group: 'main' },
  { key: 'crowded', group: 'perf' },
] as const

export function executeScenario(
  ctx: SimBrainContext,
  key: ScenarioKey,
): void {
  switch (key) {
    case 'angry_refund':
      runAngryRefundScenario(ctx)
      break
    case 'sale_1212':
      runSale1212Scenario(ctx)
      break
    case 'month_end':
      runMonthEndScenario(ctx)
      break
    case 'long_queue':
      runLongQueueScenario(ctx)
      break
    case 'hire_temps':
      runHireTempsScenario(ctx)
      break
    case 'team_offline':
      runTeamOfflineScenario(ctx)
      break
    case 'boss_telegram':
      runBossTelegramScenario(ctx)
      break
    case 'crowded':
      runCrowdedScenario(ctx)
      break
  }
}

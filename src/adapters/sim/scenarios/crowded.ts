import { pick } from '../rng'
import { hireTempEmployee, stepAssignments, stepWorkers } from '../brain/agents'
import {
  createTaskInBrain,
  emitSimEvent,
  type SimBrainContext,
} from '../brain/context'

export function runCrowdedScenario(ctx: SimBrainContext): void {
  ctx.crowdedActive = true
  emitSimEvent(ctx, 'sim.scenario', {
    key: 'crowded',
    label: {
      vi: 'Đông người (80 nhân sự)',
      en: 'Crowded building (80 staff)',
    },
  })

  const deptIds = ctx.state.config.departments.map((d) => d.id)
  let activeCount = ctx.state.config.employees.filter(
    (e) => e.state === 'active',
  ).length

  while (activeCount < 80) {
    const deptId = deptIds[activeCount % deptIds.length]!
    hireTempEmployee(ctx, deptId, 'boss')
    activeCount += 1
  }

  for (const dept of ctx.state.config.departments) {
    const deptTaskTypes = ctx.state.config.taskTypes.filter(
      (t) => t.departmentKey === dept.key && !t.key.startsWith('sys.'),
    )
    if (deptTaskTypes.length === 0) continue
    for (let i = 0; i < 18; i += 1) {
      const tt = pick(ctx.rng, deptTaskTypes)
      createTaskInBrain(ctx, tt.key, {
        requestedByKind: 'customer',
        channel: 'platform',
        departmentId: dept.id,
      })
    }
  }

  stepAssignments(ctx)
  stepWorkers(ctx, 60_000)
}

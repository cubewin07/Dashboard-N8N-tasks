import { planHire } from '@/domain/staffing'
import {
  hireTempEmployee,
  requestInitialReviewOrComplete,
} from '../brain/agents'
import {
  createTaskInBrain,
  emitSimEvent,
  getManagerEmployeeId,
  type SimBrainContext,
} from '../brain/context'

export function runHireTempsScenario(ctx: SimBrainContext): void {
  const nowIso = ctx.clock.now()
  const managerId = getManagerEmployeeId(ctx)
  emitSimEvent(ctx, 'sim.scenario', {
    key: 'hire_temps',
    label: {
      vi: 'Tuyển thêm người',
      en: 'Hire temporary staff',
    },
  })

  const cap = ctx.state.config.policy.staffing.tempCap
  const deptIds = ctx.state.config.departments.map((d) => d.id)

  let activeTemps = ctx.state.config.employees.filter(
    (e) => e.state === 'active' && e.kind === 'temp',
  ).length

  while (activeTemps < cap) {
    const deptId = deptIds[activeTemps % deptIds.length] ?? 'dep_cs'
    hireTempEmployee(ctx, deptId, 'manager')
    activeTemps += 1
  }

  // One over cap initiated by manager
  const plan = planHire({ requestedBy: 'manager' }, ctx.state, nowIso)
  if (plan.kind === 'hire_after_archive') {
    emitSimEvent(
      ctx,
      'staff.archived',
      { employeeId: plan.archiveId, reason: 'cap' },
      { actor: managerId },
    )
    hireTempEmployee(ctx, 'dep_cs', 'manager')
  } else {
    const overCapTask = createTaskInBrain(ctx, 'sys.hire_over_cap', {
      requestedByKind: 'manager',
      channel: 'internal',
      priority: 'high',
      departmentId: 'dep_cs',
      extraTags: ['hire_over_cap'],
      actor: managerId,
    })

    // R6: an over-cap request goes straight to the boss.
    requestInitialReviewOrComplete(ctx, overCapTask.id, 'boss', managerId)
  }
}

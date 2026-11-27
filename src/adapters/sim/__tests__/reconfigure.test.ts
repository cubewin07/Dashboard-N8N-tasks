import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { Department, Employee, OrgConfig, RoleDef } from '@/domain/config'
import { applyConfigChange } from '@/domain/configChange'
import { parseEvent, type OfficeEvent } from '@/domain/events'
import type { OfficeState, PersonRuntime } from '@/domain/work'
import { createBrainContext } from '../brain/tick'
import { newEmployeeId } from '../brain/context'
import { reconfigureBrain } from '../brain/reconfigure'
import { stepStaffing } from '../brain/agents'
import { GENERIC_TASK_TEMPLATES_VI, renderTaskTitle } from '../content/vi'
import { mulberry32, simId } from '../rng'
import { createSimFeed, type SimFeed } from '../SimFeed'

const HOUR = 3_600_000
const MIN = 60_000

async function newFeed(config: OrgConfig, seed: string | number = 'p10-t13') {
  const feed = createSimFeed({
    seed,
    speed: 30,
    autoStartTimer: false,
    bindGlobalControls: false,
  })
  await feed.start(config)
  const events: OfficeEvent[] = []
  feed.subscribe((batch) => events.push(...batch))
  return { feed, events }
}

type EmpId = Employee['id']

function person(
  id: EmpId,
  departmentId: Employee['departmentId'],
  roleKey: string,
  extra: Partial<Employee> = {},
): Employee {
  return {
    id,
    name: id,
    departmentId,
    roleKey,
    specialties: [],
    kind: 'core',
    state: 'active',
    reviewMode: 'always',
    modelTierOverride: null,
    bio: null,
    createdAt: '2026-11-20T00:00:00Z',
    createdBy: 'boss',
    archivedAt: null,
    ...extra,
  }
}

const OPS_DEPT: Department = {
  id: 'dep_ops',
  key: 'ops',
  label: { vi: 'Kho vận', en: 'Operations' },
  order: 5,
  colorSwatch: 'cs',
  icon: 'Truck',
  hours: 'office',
  floorTemplate: 'department',
  active: true,
}

const QA_ROLE: RoleDef = {
  key: 'qa_reviewer',
  label: { vi: 'Kiểm định', en: 'QA reviewer' },
  scope: 'department',
  caps: {
    assignTasks: false,
    approveLevel: 'reviewer',
    distributeReviews: false,
    answerQuestions: false,
    doWork: false,
    humanOwner: false,
  },
  modelTier: 'cheap',
  maxPerDepartment: null,
  workspace: 'review_desk',
  sortOrder: 9,
}

function withOpsDepartment(base: OrgConfig, reviewerRole = 'reviewer'): OrgConfig {
  return {
    ...base,
    roles: reviewerRole === QA_ROLE.key ? [...base.roles, QA_ROLE] : base.roles,
    departments: [...base.departments, OPS_DEPT],
    employees: [
      ...base.employees,
      person('emp_ops_mgr', 'dep_ops', 'dept_manager'),
      person('emp_ops_rev', 'dep_ops', reviewerRole),
      person('emp_ops_w1', 'dep_ops', 'worker'),
      person('emp_ops_w2', 'dep_ops', 'worker', { specialties: ['copywriting'] }),
      person('emp_ops_w3', 'dep_ops', 'worker'),
    ],
  }
}

function types(events: readonly OfficeEvent[], type: OfficeEvent['type']): OfficeEvent[] {
  return events.filter((e) => e.type === type)
}

function runUntil(
  feed: SimFeed,
  done: (state: OfficeState) => boolean,
  maxMs: number,
  stepMs = 30_000,
): boolean {
  for (let t = 0; t < maxMs; t += stepMs) {
    feed.stepSimMs(stepMs)
    if (done(feed.getState())) return true
  }
  return false
}

describe('SimFeed.reconfigure: a department the boss adds (P10-T13)', () => {
  it('gives the new floor generic work that is reviewed and completed within 2 sim hours', async () => {
    const { feed, events } = await newFeed(makeSeedConfig())
    feed.stepSimMs(5 * MIN)
    events.length = 0

    feed.reconfigure(withOpsDepartment(makeSeedConfig()), null)

    // config.changed first (the department exists), then one arrival per person.
    const order = events.map((e) => e.type)
    expect(order[0]).toBe('config.changed')
    expect(order.filter((t) => t === 'config.changed')).toHaveLength(1)
    expect(types(events, 'staff.hired')).toHaveLength(5)
    expect(order.indexOf('staff.hired')).toBeGreaterThan(0)
    expect(feed.getState().config.departments.some((d) => d.id === 'dep_ops')).toBe(true)

    feed.stepSimMs(2 * HOUR)

    const state = feed.getState()
    const opsTasks = Object.values(state.tasks).filter((t) => t.departmentId === 'dep_ops')
    expect(opsTasks.length).toBeGreaterThan(0)
    expect(opsTasks.every((t) => t.typeKey.startsWith('generic.'))).toBe(true)
    expect(
      opsTasks.every((t) => t.tags.includes('routine_draft') || t.tags.includes('internal_note')),
    ).toBe(true)
    expect(opsTasks.every((t) => !t.title.includes('{'))).toBe(true)

    const opsIds = new Set(opsTasks.map((t) => t.id))
    const reviewed = Object.values(state.reviews).filter((r) => opsIds.has(r.taskId))
    expect(reviewed.length).toBeGreaterThan(0)
    expect(opsTasks.some((t) => t.status === 'done')).toBe(true)

    // Every event still passes the schema, including the config.changed one.
    for (const ev of events) expect(parseEvent(ev).ok).toBe(true)
  })

  it('uses a custom role with approveLevel "reviewer" for reviews like the built-in one', async () => {
    const { feed } = await newFeed(makeSeedConfig())
    feed.reconfigure(withOpsDepartment(makeSeedConfig(), QA_ROLE.key), null)
    feed.stepSimMs(2 * HOUR)
    const state = feed.getState()
    const opsTaskIds = new Set(
      Object.values(state.tasks)
        .filter((t) => t.departmentId === 'dep_ops')
        .map((t) => t.id),
    )
    const reviewsOfQa = Object.values(state.reviews).filter(
      (r) => opsTaskIds.has(r.taskId) && r.assigneeId === 'emp_ops_rev',
    )
    expect(reviewsOfQa.length).toBeGreaterThan(0)
    expect(reviewsOfQa.some((r) => r.status === 'approved')).toBe(true)
  })

  it('does not feed a department with nobody to do the work', async () => {
    const cfg = makeSeedConfig()
    const { feed } = await newFeed(cfg)
    feed.reconfigure({ ...cfg, departments: [...cfg.departments, OPS_DEPT] }, null)
    feed.stepSimMs(2 * HOUR)
    expect(
      Object.values(feed.getState().tasks).filter((t) => t.departmentId === 'dep_ops'),
    ).toHaveLength(0)
  })

  it('has eight generic templates that render without leftover braces', () => {
    expect(GENERIC_TASK_TEMPLATES_VI).toHaveLength(8)
    const rng = mulberry32('generic-titles')
    for (const t of GENERIC_TASK_TEMPLATES_VI) {
      expect(t.tags.every((tag) => tag === 'routine_draft' || tag === 'internal_note')).toBe(true)
      for (let i = 0; i < 20; i += 1) {
        const title = renderTaskTitle(t.key, rng, { department: 'Kho vận' })
        expect(title.length).toBeGreaterThan(10)
        expect(title).not.toMatch(/[{}]/)
      }
    }
  })

  it('stops giving work to a department that was switched off', async () => {
    const cfg = withOpsDepartment(makeSeedConfig())
    const { feed } = await newFeed(cfg)
    feed.stepSimMs(HOUR)
    const before = Object.values(feed.getState().tasks).filter((t) => t.departmentId === 'dep_ops')
    expect(before.length).toBeGreaterThan(0)

    feed.reconfigure(
      applyConfigChange(feed.getState().config, {
        kind: 'department.upsert',
        department: { ...OPS_DEPT, active: false },
      }),
      null,
    )
    const countAt = Object.values(feed.getState().tasks).filter(
      (t) => t.departmentId === 'dep_ops',
    ).length
    feed.stepSimMs(2 * HOUR)
    const after = Object.values(feed.getState().tasks).filter((t) => t.departmentId === 'dep_ops')
    expect(after.length).toBe(countAt)
  })
})

describe('SimFeed.reconfigure: hires, echoes and archives (P10-T13)', () => {
  it('one hire gives exactly one staff.hired, and the echo of the same config gives none', async () => {
    const cfg = makeSeedConfig()
    const { feed, events } = await newFeed(cfg)
    feed.stepSimMs(10 * MIN)
    events.length = 0

    const hire = person('emp_new_cs', 'dep_cs', 'worker', { specialties: ['customer_chat'] })
    const next = applyConfigChange(feed.getState().config, { kind: 'employee.upsert', employee: hire })
    feed.reconfigure(next, { kind: 'employee.upsert', employee: hire })

    expect(events.map((e) => e.type)).toEqual(['staff.hired'])
    expect(feed.getState().people['emp_new_cs']).toBeDefined()

    // The ConfigSource echo: structurally equal, a different object, other stamps.
    const echo: OrgConfig = {
      ...next,
      employees: next.employees.map((e) =>
        e.id === 'emp_new_cs' ? { ...e, createdAt: '2026-11-21T00:00:00Z' } : { ...e },
      ),
    }
    events.length = 0
    feed.reconfigure(echo, null)
    feed.reconfigure(next, null)
    expect(events).toHaveLength(0)
  })

  it('a hire the sim made itself (staff.hire command) still gives one staff.hired and a silent echo', async () => {
    const { feed, events } = await newFeed(makeSeedConfig())
    feed.stepSimMs(10 * MIN)
    events.length = 0

    const ack = await feed.send({
      v: 1,
      id: 'cmd_01JCMDT13HIRE0000000001',
      type: 'staff.hire',
      issuedBy: { userId: 'emp_giam_doc', role: 'boss' },
      issuedAt: feed.now(),
      payload: { departmentId: 'dep_cs', roleKey: 'worker', specialties: ['customer_chat'] },
    })
    expect(ack.status).toBe('accepted')
    expect(types(events, 'staff.hired')).toHaveLength(1)

    // The store persists it, the source echoes it back with its own archive/hire stamps.
    const hired = (types(events, 'staff.hired')[0] as OfficeEvent<'staff.hired'>).payload.employee
    const stored: OrgConfig = {
      ...feed.getState().config,
      employees: feed
        .getState()
        .config.employees.map((e) => (e.id === hired.id ? { ...e, createdAt: '2026-12-01T00:00:00Z' } : e)),
    }
    events.length = 0
    feed.reconfigure(stored, null)
    expect(events).toHaveLength(0)
  })

  it('one dismissal gives exactly one staff.archived with the right reason, and the echo is silent', async () => {
    const { feed, events } = await newFeed(makeSeedConfig())
    feed.stepSimMs(10 * MIN)
    const victim = feed.getState().config.employees.find((e) => e.id === 'emp_ngoc')!
    events.length = 0
    const change = { kind: 'employee.archive', id: victim.id, reason: 'dismissed' } as const
    const next = applyConfigChange(feed.getState().config, change, '2026-11-02T01:20:00.000Z')
    feed.reconfigure(next, change)
    expect(events.map((e) => e.type)).toEqual(['staff.archived'])
    expect((events[0] as OfficeEvent<'staff.archived'>).payload).toEqual({
      employeeId: victim.id,
      reason: 'dismissed',
    })
    events.length = 0
    feed.reconfigure(
      applyConfigChange(feed.getState().config, change, '2026-11-02T01:21:00.000Z'),
      null,
    )
    expect(events).toHaveLength(0)
  })

  it('restoring a person gives one staff.hired', async () => {
    const cfg = makeSeedConfig()
    const archived = {
      ...cfg,
      employees: cfg.employees.map((e) =>
        e.id === 'emp_ngoc' ? { ...e, state: 'archived' as const, archivedAt: '2026-11-01T00:00:00Z' } : e,
      ),
    }
    const { feed, events } = await newFeed(archived)
    feed.stepSimMs(5 * MIN)
    events.length = 0
    feed.reconfigure(
      applyConfigChange(feed.getState().config, { kind: 'employee.restore', id: 'emp_ngoc' }),
      { kind: 'employee.restore', id: 'emp_ngoc' },
    )
    expect(events.map((e) => e.type)).toEqual(['staff.hired'])
  })

  it('requeues the running task of an archived assignee and someone else finishes it', async () => {
    const { feed, events } = await newFeed(makeSeedConfig(), 7)
    let target: { taskId: string; assigneeId: string } | null = null
    const found = runUntil(
      feed,
      (s) => {
        const t = Object.values(s.tasks).find(
          (x) =>
            x.status === 'in_progress' &&
            x.departmentId === 'dep_cs' &&
            x.assigneeId !== null &&
            s.config.employees.find((e) => e.id === x.assigneeId)?.roleKey === 'worker',
        )
        if (t) target = { taskId: t.id, assigneeId: t.assigneeId! }
        return t !== undefined
      },
      6 * HOUR,
      MIN,
    )
    expect(found).toBe(true)
    const { taskId, assigneeId } = target!
    events.length = 0

    const change = { kind: 'employee.archive', id: assigneeId, reason: 'dismissed' } as const
    feed.reconfigure(applyConfigChange(feed.getState().config, change, feed.now()), change)

    expect(types(events, 'staff.archived')).toHaveLength(1)
    const requeued = feed.getState().tasks[taskId as keyof OfficeState['tasks']]!
    expect(requeued.status).toBe('queued')
    expect(requeued.assigneeId).toBeNull()
    expect(feed.getState().people[assigneeId as keyof OfficeState['people']]).toBeUndefined()

    const reassigned = runUntil(
      feed,
      (s) => {
        const t = s.tasks[taskId as keyof OfficeState['tasks']]!
        return t.assigneeId !== null && t.assigneeId !== assigneeId
      },
      3 * HOUR,
      MIN,
    )
    expect(reassigned).toBe(true)
    const finished = runUntil(
      feed,
      (s) => s.tasks[taskId as keyof OfficeState['tasks']]!.status === 'done',
      6 * HOUR,
      MIN,
    )
    expect(finished).toBe(true)
    expect(feed.getState().tasks[taskId as keyof OfficeState['tasks']]!.assigneeId).not.toBe(assigneeId)
  })
})

describe('SimFeed.reconfigure: policy and platforms (P10-T13)', () => {
  it('archives idle temps longest idle first when tempCap is lowered, never a busy one', async () => {
    const cfg = makeSeedConfig()
    const temp = (id: EmpId) => person(id, 'dep_cs', 'worker', { kind: 'temp', createdBy: 'manager' })
    const withTemps: OrgConfig = {
      ...cfg,
      policy: {
        ...cfg.policy,
        staffing: { ...cfg.policy.staffing, tempCap: 10, minIdleMinutesBeforeDrop: 60 },
      },
      employees: [...cfg.employees, temp('emp_t_a'), temp('emp_t_b'), temp('emp_t_c'), temp('emp_t_d')],
    }
    const ctx = createBrainContext(withTemps, 'cap', 30)
    const now = ctx.clock.nowMs()
    const at = (minutesAgo: number) => new Date(now - minutesAgo * MIN).toISOString()
    const setPerson = (id: EmpId, patch: Partial<PersonRuntime>) => {
      ctx.state = {
        ...ctx.state,
        people: { ...ctx.state.people, [id]: { ...ctx.state.people[id]!, ...patch } },
      }
    }
    setPerson('emp_t_a', { idleSince: at(200) }) // idle longest
    setPerson('emp_t_b', { idleSince: at(90) })
    setPerson('emp_t_c', { activity: 'working', idleSince: null, taskId: 'task_01JBUSY' as never }) // busy
    setPerson('emp_t_d', { idleSince: at(20) }) // idle, but not for an hour yet

    reconfigureBrain(
      ctx,
      applyConfigChange(ctx.state.config, {
        kind: 'policy.set',
        policy: { ...withTemps.policy, staffing: { ...withTemps.policy.staffing, tempCap: 1 } },
      }),
      null,
    )
    ctx.pendingEvents.length = 0

    stepStaffing(ctx)
    const archivedIds = () =>
      ctx.pendingEvents
        .filter((e) => e.type === 'staff.archived')
        .map((e) => (e as OfficeEvent<'staff.archived'>).payload)
    expect(archivedIds()).toEqual([
      { employeeId: 'emp_t_a', reason: 'cap' },
      { employeeId: 'emp_t_b', reason: 'cap' },
    ])
    expect(ctx.state.people['emp_t_c']).toBeDefined()

    // 45 minutes later the short-idle temp is eligible; the busy one still finishes first.
    ctx.clock.advanceSimMs(45 * MIN)
    stepStaffing(ctx)
    expect(archivedIds().map((p) => p.employeeId)).toEqual(['emp_t_a', 'emp_t_b', 'emp_t_d'])

    // Count is now at the cap (the busy temp): nothing more, and the rule switches itself off.
    ctx.clock.advanceSimMs(2 * HOUR)
    stepStaffing(ctx)
    expect(archivedIds()).toHaveLength(3)
    expect(ctx.enforceTempCap).toBe(false)
    expect(
      ctx.state.config.employees.filter((e) => e.kind === 'temp' && e.state === 'active').map((e) => e.id),
    ).toEqual(['emp_t_c'])
  })

  it('leaves temps alone when the count is above the cap without the cap having been lowered', () => {
    const cfg = makeSeedConfig()
    const temps = (['emp_t_a', 'emp_t_b', 'emp_t_c'] as const).map((id) =>
      person(id, 'dep_cs', 'worker', { kind: 'temp' }),
    )
    const ctx = createBrainContext(
      {
        ...cfg,
        policy: { ...cfg.policy, staffing: { ...cfg.policy.staffing, tempCap: 1, minIdleMinutesBeforeDrop: 1 } },
        employees: [...cfg.employees, ...temps],
      },
      'over-cap-approved',
      30,
    )
    ctx.clock.advanceSimMs(3 * HOUR)
    ctx.pendingEvents.length = 0
    stepStaffing(ctx)
    expect(ctx.pendingEvents.filter((e) => e.type === 'staff.archived')).toHaveLength(0)
  })

  it('never puts an inactive platform on a new task, in a title or on a shop', async () => {
    const cfg = makeSeedConfig()
    const off: OrgConfig = {
      ...cfg,
      platforms: cfg.platforms.map((p) =>
        p.key === 'shopee' || p.key === 'lazada' ? { ...p, active: false } : p,
      ),
    }
    const { feed, events } = await newFeed(off, 'platforms')
    feed.stepSimMs(10 * HOUR)
    const created = types(events, 'task.created').map((e) => (e as OfficeEvent<'task.created'>).payload.task)
    expect(created.length).toBeGreaterThan(20)
    expect(created.filter((t) => t.platformKey === 'shopee' || t.platformKey === 'lazada')).toHaveLength(0)
    expect(created.some((t) => t.platformKey !== null)).toBe(true)
    const shopsById = new Map(off.shops.map((s) => [s.id, s]))
    for (const t of created) {
      if (t.shopId) expect(['shopee', 'lazada']).not.toContain(shopsById.get(t.shopId as never)?.platformKey)
    }
    // Tasks that carried one of the switched-off platforms by type default never name it in the title.
    expect(created.filter((t) => /Shopee|Lazada/.test(t.title))).toHaveLength(0)
  })

  it('reads policy and approval rules from the current config on every decision', async () => {
    const cfg = makeSeedConfig()
    const { feed } = await newFeed(cfg, 'rules')
    feed.stepSimMs(30 * MIN)
    // Turn every rule off and the default level to reviewer: new tasks need only a reviewer.
    const next: OrgConfig = {
      ...feed.getState().config,
      approvalRules: feed.getState().config.approvalRules.map((r) => ({ ...r, enabled: false })),
      policy: {
        ...feed.getState().config.policy,
        approvals: { ...feed.getState().config.policy.approvals, defaultLevel: 'reviewer' },
      },
    }
    const seen = new Set(Object.keys(feed.getState().tasks))
    feed.reconfigure(next, null)
    feed.stepSimMs(3 * HOUR)
    const fresh = Object.values(feed.getState().tasks).filter((t) => !seen.has(t.id))
    expect(fresh.length).toBeGreaterThan(5)
    expect(fresh.every((t) => t.requiredLevel === 'reviewer')).toBe(true)
  })
})

describe('SimFeed: ids and reset with an edited config (P10-T13)', () => {
  it('never draws an employee id that a persisted employee already has', () => {
    const cfg = makeSeedConfig()
    const probe = createBrainContext(cfg, 'reload', 30)
    const predicted = simId('emp', probe.rng, probe.clock.nowMs())

    // Same seed, same clock: the sim would draw `predicted` again after a reload.
    const reloaded = createBrainContext(
      { ...cfg, employees: [...cfg.employees, person(predicted, 'dep_cs', 'worker', { kind: 'temp' })] },
      'reload',
      30,
    )
    const id = newEmployeeId(reloaded)
    expect(id).not.toBe(predicted)
    expect(reloaded.state.config.employees.some((e) => e.id === id)).toBe(false)
  })

  it('starts a reset (new seed) from the current config, not the bundled one', async () => {
    const { feed } = await newFeed(makeSeedConfig())
    feed.reconfigure(withOpsDepartment(makeSeedConfig()), null)
    feed.stepSimMs(HOUR)
    feed.setSeed('another-seed')
    const state = feed.getState()
    expect(state.config.departments.some((d) => d.id === 'dep_ops')).toBe(true)
    expect(state.people['emp_ops_w1']).toBeDefined()
    expect(Object.keys(state.tasks)).toHaveLength(0)
    feed.stepSimMs(2 * HOUR)
    expect(
      Object.values(feed.getState().tasks).some((t) => t.departmentId === 'dep_ops'),
    ).toBe(true)
  })
})

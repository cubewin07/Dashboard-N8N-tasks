import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  ev,
  makeConfig,
  makeEvent,
  makeSampleTask,
  makeSeedConfig,
  makeState,
  t,
} from '../__fixtures__/builders'
import { EVENT_TYPES, parseEvent, type EventType, type OfficeEvent } from '../events'
import { apply, applyAll, applyConfigChange, initialState } from '../reducer'

const fixturesDir = path.resolve(import.meta.dirname, '../__fixtures__/events')

function loadValidFixture<T extends EventType>(
  type: T,
  seq = 1,
  at = t(seq),
): OfficeEvent<T> {
  const raw = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, `${type}.valid.json`), 'utf8'),
  ) as Record<string, unknown>
  const parsed = parseEvent({ ...raw, seq, at })
  if (!parsed.ok) {
    throw new Error(`Invalid fixture for ${type}: ${parsed.reason}`)
  }
  return parsed.event as OfficeEvent<T>
}

describe('domain reducer', () => {
  it('builds initialState with active employees idle and archived employees excluded', () => {
    const cfg = makeConfig({
      employees: [
        ...makeConfig().employees,
        {
          id: 'emp_archived',
          name: 'Cũ',
          departmentId: 'dep_cs',
          roleKey: 'worker',
          specialties: ['customer_chat'],
          kind: 'temp',
          state: 'archived',
          reviewMode: 'always',
          modelTierOverride: null,
          bio: null,
          createdAt: '2026-11-10T00:00:00Z',
          createdBy: 'manager',
          archivedAt: '2026-11-10T01:00:00Z',
        },
      ],
    })
    const state = initialState(cfg, t(0))
    expect(Object.keys(state.people)).toHaveLength(4)
    expect(state.people.emp_mai?.activity).toBe('idle')
    expect(state.people.emp_archived).toBeUndefined()
  })

  it('ignores events with seq <= state.seq (idempotent)', () => {
    const s0 = makeState()
    const e1 = ev.personActivity('emp_mai', 'working', 2, t(2))
    const s1 = apply(s0, e1)
    expect(s1.seq).toBe(2)
    expect(s1.people.emp_mai?.activity).toBe('working')

    const sDup = apply(s1, ev.personActivity('emp_mai', 'idle', 2, t(3)))
    expect(sDup).toBe(s1)
    const sOld = apply(s1, ev.personActivity('emp_mai', 'idle', 1, t(3)))
    expect(sOld).toBe(s1)
  })

  it('skips unknown event types and unknown entity IDs with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s0 = makeState()

    const unknownTypeEvt = {
      ...ev.personActivity('emp_mai', 'working', 1, t(1)),
      type: 'future.unknown_event',
    } as unknown as OfficeEvent
    expect(apply(s0, unknownTypeEvt)).toBe(s0)
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockClear()
    const unknownEmpEvt = ev.personActivity('emp_ghost', 'working', 1, t(1))
    expect(apply(s0, unknownEmpEvt)).toBe(s0)
    expect(warnSpy).toHaveBeenCalled()

    // Unknown references for task/review/question/help/staff events
    const badEvents: OfficeEvent[] = [
      makeEvent('task.created', {
        task: makeSampleTask({ departmentId: 'dep_unknown' }),
      }),
      makeEvent('task.created', {
        task: makeSampleTask({ assigneeId: 'emp_ghost' }),
      }),
      makeEvent('task.assigned', {
        taskId: 'task_ghost',
        assigneeId: 'emp_mai',
        byId: 'emp_thu',
      }),
      makeEvent('task.started', { taskId: 'task_ghost' }),
      makeEvent('task.progressed', { taskId: 'task_ghost', progress: 0.4 }),
      makeEvent('task.handed_off', {
        taskId: 'task_ghost',
        fromId: 'emp_mai',
        toId: 'emp_thu',
      }),
      makeEvent('task.reprioritised', { taskId: 'task_ghost', priority: 'urgent' }),
      makeEvent('task.blocked', { taskId: 'task_ghost', reason: 'blocked' }),
      makeEvent('task.completed', { taskId: 'task_ghost' }),
      makeEvent('task.cancelled', { taskId: 'task_ghost', reason: 'cancelled' }),
      makeEvent('task.failed', { taskId: 'task_ghost', reason: 'failed' }),
      makeEvent('review.requested', {
        review: {
          id: 'rev_1',
          taskId: 'task_ghost',
          level: 'reviewer',
          assigneeId: 'emp_mai',
          status: 'pending',
          priority: 'normal',
          createdAt: t(0),
          decidedAt: null,
          decidedBy: null,
          note: null,
        },
      }),
      makeEvent('review.started', { reviewId: 'rev_ghost' }),
      makeEvent('review.decided', { reviewId: 'rev_ghost', decision: 'approved' }),
      makeEvent('review.escalated', {
        reviewId: 'rev_ghost',
        toLevel: 'boss',
        newReview: {
          id: 'rev_2',
          taskId: 'task_ghost',
          level: 'boss',
          assigneeId: 'emp_owner_1',
          status: 'pending',
          priority: 'normal',
          createdAt: t(0),
          decidedAt: null,
          decidedBy: null,
          note: null,
        },
      }),
      makeEvent('question.asked', {
        question: {
          id: 'q_1',
          taskId: 'task_ghost',
          fromId: 'emp_mai',
          toId: 'emp_thu',
          text: 'Hỏi?',
          status: 'open',
          inPerson: false,
          createdAt: t(0),
          answeredAt: null,
        },
      }),
      makeEvent('question.answered', { questionId: 'q_ghost', answer: 'Ok' }),
      makeEvent('help.requested', {
        help: {
          id: 'help_1',
          taskId: 'task_ghost',
          fromId: 'emp_mai',
          specialty: 'customer_chat',
          toId: 'emp_ngoc',
          round: 1,
          status: 'open',
          createdAt: t(0),
          timeoutAt: t(30),
        },
      }),
      makeEvent('help.accepted', { helpId: 'help_ghost', byId: 'emp_ngoc' }),
      makeEvent('help.answered', { helpId: 'help_ghost', byId: 'emp_ngoc' }),
      makeEvent('help.timed_out', { helpId: 'help_ghost', toId: 'emp_ngoc' }),
      makeEvent('help.escalated', { helpId: 'help_ghost', toId: 'emp_ngoc' }),
      makeEvent('staff.hired', {
        employee: {
          id: 'emp_bad_dept',
          name: 'Tân',
          departmentId: 'dep_ghost',
          roleKey: 'worker',
          specialties: ['customer_chat'],
          kind: 'temp',
          state: 'active',
          reviewMode: 'always',
          modelTierOverride: null,
          bio: null,
          createdAt: t(0),
          createdBy: 'manager',
          archivedAt: null,
        },
      }),
      makeEvent('staff.archived', { employeeId: 'emp_ghost', reason: 'cap' }),
    ]

    for (const evt of badEvents) {
      expect(apply(s0, evt)).toBe(s0)
    }
    warnSpy.mockRestore()
  })

  it('handles every event type in EVENT_TYPES using valid fixtures on seed config', () => {
    const seedCfg = makeSeedConfig({
      taskTypes: [
        {
          key: 'cs.reply_review',
          departmentKey: 'cs',
          label: { vi: 'Trả lời đánh giá', en: 'Reply review' },
          specialty: 'review_reply',
          tags: ['routine_draft'],
          defaultPriority: 'normal',
          durationMinutes: [5, 10],
          platformKeys: ['shopee'],
          needsHelpFrom: [],
          carries: 'phone',
        },
      ],
    })
    let s = initialState(seedCfg, t(0))
    let seq = 0
    const next = <T extends EventType>(type: T) => {
      seq += 1
      return loadValidFixture(type, seq, t(seq))
    }

    // 1. intake.received
    s = apply(s, next('intake.received'))
    expect(s.messages.msg_01JTEST000000000000000001?.text).toContain('Shopee 1')

    // 2. task.created (also link causedBy to intake message)
    const createdFixture = next('task.created')
    s = apply(s, {
      ...createdFixture,
      causedBy: 'msg_01JTEST000000000000000001',
    })
    expect(s.tasks.task_01JTEST000000000000000001?.status).toBe('queued')
    expect(s.messages.msg_01JTEST000000000000000001?.taskIds).toEqual([
      'task_01JTEST000000000000000001',
    ])

    // 3. task.assigned (cross-person: emp_thu assigns to emp_mai -> emp_thu delivering)
    s = apply(s, next('task.assigned'))
    expect(s.tasks.task_01JTEST000000000000000001?.assigneeId).toBe('emp_mai')
    expect(s.people.emp_thu?.activity).toBe('delivering')

    // 4. task.started -> emp_mai working, carrying from taskType ('phone')
    s = apply(s, next('task.started'))
    expect(s.tasks.task_01JTEST000000000000000001?.status).toBe('in_progress')
    expect(s.people.emp_mai?.activity).toBe('working')
    expect(s.people.emp_mai?.carrying).toBe('phone')
    expect(s.people.emp_mai?.platformKey).toBe('shopee')

    // 5. task.progressed
    s = apply(s, next('task.progressed'))
    expect(s.tasks.task_01JTEST000000000000000001?.progress).toBe(0.5)

    // 6. question.asked (inPerson: true -> waiting_answer)
    s = apply(s, next('question.asked'))
    expect(s.questions.q_01JTEST000000000000000001?.status).toBe('open')
    expect(s.tasks.task_01JTEST000000000000000001?.status).toBe('waiting_answer')
    expect(s.people.emp_mai?.activity).toBe('waiting_answer')

    // 7. question.answered -> asker back to working
    s = apply(s, next('question.answered'))
    expect(s.questions.q_01JTEST000000000000000001?.status).toBe('answered')
    expect(s.tasks.task_01JTEST000000000000000001?.status).toBe('in_progress')
    expect(s.people.emp_mai?.activity).toBe('working')

    // 8. help.requested
    s = apply(s, next('help.requested'))
    expect(s.help.help_01JTEST000000000000000001?.status).toBe('open')
    expect(s.tasks.task_01JTEST000000000000000001?.status).toBe('waiting_help')

    // 9. help.accepted -> helper (emp_long) helping
    s = apply(s, next('help.accepted'))
    expect(s.help.help_01JTEST000000000000000001?.status).toBe('accepted')
    expect(s.people.emp_long?.activity).toBe('helping')

    // 10. help.timed_out -> round + 1
    s = apply(s, next('help.timed_out'))
    expect(s.help.help_01JTEST000000000000000001?.status).toBe('timed_out')
    expect(s.help.help_01JTEST000000000000000001?.round).toBe(2)

    // 11. help.escalated
    s = apply(s, next('help.escalated'))
    expect(s.help.help_01JTEST000000000000000001?.status).toBe('escalated')
    expect(s.help.help_01JTEST000000000000000001?.toId).toBe('emp_minh')

    // 12. help.answered -> helper back to idle, task back to in_progress
    s = apply(s, next('help.answered'))
    expect(s.help.help_01JTEST000000000000000001?.status).toBe('answered')
    expect(s.tasks.task_01JTEST000000000000000001?.status).toBe('in_progress')
    expect(s.people.emp_long?.activity).toBe('idle')

    // 13. review.requested -> task in_review, courier (emp_mai) delivering
    s = apply(s, next('review.requested'))
    expect(s.reviews.rev_01JTEST000000000000000001?.status).toBe('pending')
    expect(s.tasks.task_01JTEST000000000000000001?.status).toBe('in_review')
    expect(s.people.emp_mai?.activity).toBe('delivering')

    // 14. task.reprioritised -> updates task and pending review priority
    s = apply(s, next('task.reprioritised'))
    expect(s.tasks.task_01JTEST000000000000000001?.priority).toBe('urgent')
    expect(s.reviews.rev_01JTEST000000000000000001?.priority).toBe('urgent')

    // 15. review.started -> approver (emp_an) reviewing
    s = apply(s, next('review.started'))
    expect(s.reviews.rev_01JTEST000000000000000001?.status).toBe('in_review')
    expect(s.people.emp_an?.activity).toBe('reviewing')

    // 16. review.decided (approved) -> approver freed to idle
    s = apply(s, next('review.decided'))
    expect(s.reviews.rev_01JTEST000000000000000001?.status).toBe('approved')
    expect(s.people.emp_an?.activity).toBe('idle')

    // 17. review.escalated -> adds rev_01JTEST000000000000000002, courier (emp_an) delivering
    s = apply(s, next('review.escalated'))
    expect(s.reviews.rev_01JTEST000000000000000002?.level).toBe('dept_manager')
    expect(s.people.emp_an?.activity).toBe('delivering')

    // 18. task.handed_off (emp_mai -> emp_trang)
    s = apply(s, next('task.handed_off'))
    expect(s.tasks.task_01JTEST000000000000000001?.assigneeId).toBe('emp_trang')
    expect(s.people.emp_mai?.activity).toBe('delivering')

    // 19. task.blocked
    s = apply(s, next('task.blocked'))
    expect(s.tasks.task_01JTEST000000000000000001?.status).toBe('blocked')

    // 20. task.completed -> done, progress 1, assignee freed to idle
    s = apply(s, next('task.completed'))
    expect(s.tasks.task_01JTEST000000000000000001?.status).toBe('done')
    expect(s.tasks.task_01JTEST000000000000000001?.progress).toBe(1)
    expect(s.people.emp_trang?.activity).toBe('idle')
    expect(s.people.emp_trang?.idleSince).toBe(s.now)

    // 21. task.failed
    s = apply(s, next('task.failed'))
    expect(s.tasks.task_01JTEST000000000000000001?.status).toBe('failed')

    // 22. task.cancelled
    s = apply(s, next('task.cancelled'))
    expect(s.tasks.task_01JTEST000000000000000001?.status).toBe('cancelled')

    // 23. person.activity
    s = apply(s, next('person.activity'))
    expect(s.people.emp_mai?.activity).toBe('working')
    expect(s.people.emp_mai?.location).toEqual({ floorKey: 'cs', target: 'desk' })

    // 24. staff.hired
    s = apply(s, next('staff.hired'))
    expect(s.people.emp_temp_01?.activity).toBe('idle')
    expect(s.config.employees.some((e) => e.id === 'emp_temp_01')).toBe(true)

    // 25. config.changed (archives emp_temp_01)
    s = apply(s, next('config.changed'))
    expect(
      s.config.employees.find((e) => e.id === 'emp_temp_01')?.state,
    ).toBe('archived')
    expect(s.people.emp_temp_01).toBeUndefined()

    // Hire again then test 26. staff.archived
    seq += 1
    s = apply(s, loadValidFixture('staff.hired', seq, t(seq)))
    expect(s.people.emp_temp_01).toBeDefined()
    s = apply(s, next('staff.archived'))
    expect(s.people.emp_temp_01).toBeUndefined()
    expect(
      s.config.employees.find((e) => e.id === 'emp_temp_01')?.state,
    ).toBe('archived')

    // 27. system.heartbeat
    s = apply(s, next('system.heartbeat'))
    expect(s.lastHeartbeat?.source).toBe('sim')

    // 28. sim.scenario
    s = apply(s, next('sim.scenario'))
    expect(s.log.at(-1)?.type).toBe('sim.scenario')

    // Confirm all 28 EVENT_TYPES were exercised. Heartbeats update
    // `lastHeartbeat` instead of the log (covered by its own test below).
    expect(s.lastHeartbeat).not.toBeNull()
    const loggedTypes = new Set(s.log.map((e) => e.type))
    for (const type of EVENT_TYPES) {
      if (type === 'system.heartbeat') continue
      expect(loggedTypes.has(type)).toBe(true)
    }
  })

  it('handles review.decided changes_requested and rejected transitions, plus non-inPerson question.asked', () => {
    let s = makeState()
    s = apply(s, ev.taskCreated({ id: 'task_1', assigneeId: 'emp_mai' }, 1, t(1)))
    s = apply(s, makeEvent('task.started', { taskId: 'task_1' }, { seq: 2, at: t(2) }))
    s = apply(
      s,
      makeEvent('task.progressed', { taskId: 'task_1', progress: 0.9 }, { seq: 3, at: t(3) }),
    )

    // Non-inPerson question -> 'asking'
    s = apply(
      s,
      makeEvent(
        'question.asked',
        {
          question: {
            id: 'q_1',
            taskId: 'task_1',
            fromId: 'emp_mai',
            toId: 'emp_ngoc',
            text: 'Hỏi nhanh?',
            status: 'open',
            inPerson: false,
            createdAt: t(4),
            answeredAt: null,
          },
        },
        { seq: 4, at: t(4) },
      ),
    )
    expect(s.people.emp_mai?.activity).toBe('asking')

    // Request review -> start -> changes_requested -> task back to in_progress at 0.6, attempts+1
    s = apply(
      s,
      makeEvent(
        'review.requested',
        {
          review: {
            id: 'rev_1',
            taskId: 'task_1',
            level: 'dept_manager',
            assigneeId: 'emp_ngoc',
            status: 'pending',
            priority: 'normal',
            createdAt: t(5),
            decidedAt: null,
            decidedBy: null,
            note: null,
          },
        },
        { seq: 5, at: t(5) },
      ),
    )
    s = apply(
      s,
      makeEvent('review.started', { reviewId: 'rev_1' }, { seq: 6, at: t(6) }),
    )
    s = apply(
      s,
      makeEvent(
        'review.decided',
        { reviewId: 'rev_1', decision: 'changes_requested', note: 'Sửa lại câu chữ' },
        { seq: 7, at: t(7), actor: { kind: 'employee', id: 'emp_ngoc' } },
      ),
    )
    expect(s.tasks.task_1?.status).toBe('in_progress')
    expect(s.tasks.task_1?.progress).toBe(0.6)
    expect(s.tasks.task_1?.attempts).toBe(2)
    expect(s.people.emp_mai?.activity).toBe('working')

    // Second review -> rejected -> task cancelled and worker idle
    s = apply(
      s,
      makeEvent(
        'review.requested',
        {
          review: {
            id: 'rev_2',
            taskId: 'task_1',
            level: 'dept_manager',
            assigneeId: 'emp_ngoc',
            status: 'pending',
            priority: 'normal',
            createdAt: t(8),
            decidedAt: null,
            decidedBy: null,
            note: null,
          },
        },
        { seq: 8, at: t(8) },
      ),
    )
    s = apply(
      s,
      makeEvent(
        'review.decided',
        { reviewId: 'rev_2', decision: 'rejected', note: 'Huỷ bỏ' },
        { seq: 9, at: t(9), actor: { kind: 'employee', id: 'emp_ngoc' } },
      ),
    )
    expect(s.tasks.task_1?.status).toBe('cancelled')
    expect(s.people.emp_mai?.activity).toBe('idle')
  })

  it('caps the log ring buffer at 500 events and supports applyAll', () => {
    const s0 = makeState()
    const batch: OfficeEvent[] = []
    for (let i = 1; i <= 520; i += 1) {
      batch.push(
        ev.personActivity('emp_mai', i % 2 === 0 ? 'working' : 'idle', i, t(i)),
      )
    }
    const sFinal = applyAll(s0, batch)
    expect(sFinal.seq).toBe(520)
    expect(sFinal.log).toHaveLength(500)
    expect(sFinal.log[0]?.seq).toBe(21)
    expect(sFinal.log.at(-1)?.seq).toBe(520)
  })

  it('applies all ConfigChange variants cleanly', () => {
    const cfg = makeConfig()
    const dept2 = {
      ...cfg.departments[0]!,
      id: 'dep_mkt' as const,
      key: 'marketing',
      order: 2,
    }
    const c1 = applyConfigChange(cfg, { kind: 'department.upsert', department: dept2 })
    expect(c1.departments).toHaveLength(2)
    const c1Update = applyConfigChange(c1, {
      kind: 'department.upsert',
      department: { ...dept2, hours: 'office' },
    })
    expect(c1Update.departments[1]?.hours).toBe('office')

    const c2 = applyConfigChange(c1, {
      kind: 'department.reorder',
      ids: ['dep_mkt', 'dep_cs'],
    })
    expect(c2.departments.find((d) => d.id === 'dep_mkt')?.order).toBe(1)

    const customRole = { ...cfg.roles[5]!, key: 'intern', sortOrder: 6 }
    const c3 = applyConfigChange(c2, { kind: 'role.upsert', role: customRole })
    expect(c3.roles.some((r) => r.key === 'intern')).toBe(true)
    const c4 = applyConfigChange(c3, { kind: 'role.delete', key: 'intern' })
    expect(c4.roles.some((r) => r.key === 'intern')).toBe(false)

    const spec = {
      key: 'seo',
      label: { vi: 'SEO', en: 'SEO' },
      icon: 'Search',
      homeDepartmentKey: 'cs',
    }
    const c5 = applyConfigChange(c4, { kind: 'specialty.upsert', specialty: spec })
    expect(c5.specialties.some((s) => s.key === 'seo')).toBe(true)
    const c6 = applyConfigChange(c5, { kind: 'specialty.delete', key: 'seo' })
    expect(c6.specialties.some((s) => s.key === 'seo')).toBe(false)

    const c7 = applyConfigChange(
      c6,
      { kind: 'employee.archive', id: 'emp_mai', reason: 'dismissed' },
      t(10),
    )
    expect(c7.employees.find((e) => e.id === 'emp_mai')?.state).toBe('archived')
    const c8 = applyConfigChange(c7, { kind: 'employee.restore', id: 'emp_mai' })
    expect(c8.employees.find((e) => e.id === 'emp_mai')?.state).toBe('active')

    const c9 = applyConfigChange(c8, {
      kind: 'policy.set',
      policy: {
        ...cfg.policy,
        staffing: { ...cfg.policy.staffing, tempCap: 5 },
      },
    })
    expect(c9.policy.staffing.tempCap).toBe(5)

    const rule2 = { ...cfg.approvalRules[0]!, id: 'rule_2', order: 2 }
    const c10 = applyConfigChange(c9, { kind: 'rule.upsert', rule: rule2 })
    expect(c10.approvalRules).toHaveLength(2)
    const c11 = applyConfigChange(c10, {
      kind: 'rule.reorder',
      ids: ['rule_2', 'boss_sensitive'],
    })
    expect(c11.approvalRules.find((r) => r.id === 'rule_2')?.order).toBe(1)
    const c12 = applyConfigChange(c11, { kind: 'rule.delete', id: 'rule_2' })
    expect(c12.approvalRules).toHaveLength(1)

    const c13 = applyConfigChange(c12, {
      kind: 'platform.upsert',
      platform: { ...cfg.platforms[0]!, key: 'lazada' },
    })
    expect(c13.platforms).toHaveLength(2)

    const c14 = applyConfigChange(c13, {
      kind: 'shop.upsert',
      shop: { id: 'shop_laz_1', platformKey: 'lazada', name: 'Lazada 1', handle: null },
    })
    expect(c14.shops).toHaveLength(2)

    const c15 = applyConfigChange(c14, {
      kind: 'taskType.upsert',
      taskType: {
        key: 'cs.chat',
        departmentKey: 'cs',
        label: { vi: 'Chat', en: 'Chat' },
        specialty: 'customer_chat',
        tags: [],
        defaultPriority: 'normal',
        durationMinutes: [5, 10],
        platformKeys: ['shopee'],
        needsHelpFrom: [],
        carries: 'laptop',
      },
    })
    expect(c15.taskTypes).toHaveLength(1)

    const c16 = applyConfigChange(c15, { kind: 'config.replace', config: cfg })
    expect(c16).toBe(cfg)
  })
  it('frees a worker who finishes a task while an earlier task waits in review', () => {
    const reviewing = makeSampleTask({
      id: 'task_01JTEST00000000000000000A',
      assigneeId: 'emp_mai',
      status: 'in_review',
      progress: 1,
    })
    const active = makeSampleTask({
      id: 'task_01JTEST00000000000000000B',
      assigneeId: 'emp_mai',
      status: 'in_progress',
    })
    const base = makeState()
    const s0 = {
      ...base,
      tasks: { ...base.tasks, [reviewing.id]: reviewing, [active.id]: active },
      people: {
        ...base.people,
        emp_mai: { ...base.people.emp_mai!, activity: 'working' as const, taskId: active.id },
      },
    }
    const s1 = apply(
      s0,
      makeEvent('task.completed', { taskId: active.id }, { seq: 1, at: t(1) }),
    )
    // Not re-bound to the task sitting in review: she can take new work.
    expect(s1.people.emp_mai?.activity).toBe('idle')
    expect(s1.people.emp_mai?.taskId).toBeNull()
  })
  it('returns unfinished work to the queue when its assignee is archived', () => {
    const working = makeSampleTask({
      id: 'task_01JTEST00000000000000000C',
      assigneeId: 'emp_mai',
      status: 'in_progress',
      progress: 0.5,
      startedAt: t(1),
    })
    const reviewing = makeSampleTask({
      id: 'task_01JTEST00000000000000000D',
      assigneeId: 'emp_mai',
      status: 'in_review',
      progress: 1,
    })
    const base = makeState()
    const s0 = {
      ...base,
      tasks: { ...base.tasks, [working.id]: working, [reviewing.id]: reviewing },
    }
    const s1 = apply(
      s0,
      makeEvent(
        'staff.archived',
        { employeeId: 'emp_mai', reason: 'dismissed' },
        { seq: 1, at: t(2) },
      ),
    )
    expect(s1.people.emp_mai).toBeUndefined()
    expect(s1.tasks[working.id]).toMatchObject({
      status: 'queued',
      assigneeId: null,
      progress: 0,
      startedAt: null,
    })
    // Already handed in: only approvals remain, the assignee stays on record.
    expect(s1.tasks[reviewing.id]).toMatchObject({
      status: 'in_review',
      assigneeId: 'emp_mai',
    })
  })
  it('records heartbeats as liveness without filling the activity log', () => {
    const s0 = makeState()
    const s1 = apply(
      s0,
      makeEvent(
        'system.heartbeat',
        { source: 'sim', version: '1.0.0' },
        { seq: 1, at: t(1) },
      ),
    )
    expect(s1.lastHeartbeat?.at).toBe(t(1))
    expect(s1.seq).toBe(1)
    expect(s1.log).toHaveLength(0)
  })
  describe('late and duplicate events', () => {
    const base = () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      return { warn }
    }

    it('ignores a decision on a review that is already settled', () => {
      const { warn } = base()
      const task = makeSampleTask({
        id: 'task_01JTEST00000000000000000E',
        assigneeId: 'emp_mai',
        status: 'cancelled',
      })
      const review = {
        id: 'rev_01JTEST00000000000000000E' as const,
        taskId: task.id,
        level: 'reviewer' as const,
        assigneeId: 'emp_an' as const,
        status: 'rejected' as const,
        priority: 'normal' as const,
        createdAt: t(1),
        decidedAt: t(2),
        decidedBy: 'emp_an' as const,
        note: null,
      }
      const b = initialState(makeSeedConfig(), t(0))
      const s0 = {
        ...b,
        tasks: { ...b.tasks, [task.id]: task },
        reviews: { ...b.reviews, [review.id]: review },
      }
      const s1 = apply(
        s0,
        makeEvent(
          'review.decided',
          { reviewId: review.id, decision: 'changes_requested', note: 'x' },
          { seq: 1, at: t(3), actor: { kind: 'employee', id: 'emp_an' } },
        ),
      )
      // The cancelled task is not dragged back to in_progress.
      expect(s1).toBe(s0)
      expect(s1.tasks[task.id]?.status).toBe('cancelled')
      warn.mockRestore()
    })

    it('ignores an answer to an expired question', () => {
      const { warn } = base()
      const task = makeSampleTask({
        id: 'task_01JTEST00000000000000000F',
        assigneeId: 'emp_mai',
        status: 'cancelled',
      })
      const question = {
        id: 'q_01JTEST00000000000000000F' as const,
        taskId: task.id,
        fromId: 'emp_mai' as const,
        toId: 'emp_thu' as const,
        text: '?',
        status: 'expired' as const,
        inPerson: false,
        createdAt: t(1),
        answeredAt: t(2),
      }
      const b = initialState(makeSeedConfig(), t(0))
      const s0 = {
        ...b,
        tasks: { ...b.tasks, [task.id]: task },
        questions: { ...b.questions, [question.id]: question },
      }
      const s1 = apply(
        s0,
        makeEvent('question.answered', { questionId: question.id, answer: 'ok' }, { seq: 1, at: t(3) }),
      )
      expect(s1).toBe(s0)
      expect(s1.people.emp_mai?.activity).toBe('idle')
      warn.mockRestore()
    })

    it('cancelling a task frees its approver and closes its help requests', () => {
      const task = makeSampleTask({
        id: 'task_01JTEST00000000000000000G',
        assigneeId: 'emp_mai',
        status: 'in_review',
      })
      const review = {
        id: 'rev_01JTEST00000000000000000G' as const,
        taskId: task.id,
        level: 'reviewer' as const,
        assigneeId: 'emp_an' as const,
        status: 'in_review' as const,
        priority: 'normal' as const,
        createdAt: t(1),
        decidedAt: null,
        decidedBy: null,
        note: null,
      }
      const help = {
        id: 'help_01JTEST00000000000000000G' as const,
        taskId: task.id,
        fromId: 'emp_mai' as const,
        specialty: 'image',
        toId: 'emp_quan' as const,
        round: 1,
        status: 'accepted' as const,
        createdAt: t(1),
        timeoutAt: t(30),
      }
      const b = initialState(makeSeedConfig(), t(0))
      const s0 = {
        ...b,
        tasks: { ...b.tasks, [task.id]: task },
        reviews: { ...b.reviews, [review.id]: review },
        help: { ...b.help, [help.id]: help },
        people: {
          ...b.people,
          emp_an: { ...b.people.emp_an!, activity: 'reviewing' as const, taskId: task.id },
          emp_quan: { ...b.people.emp_quan!, activity: 'helping' as const },
        },
      }
      const s1 = apply(
        s0,
        makeEvent('task.cancelled', { taskId: task.id, reason: 'huỷ' }, { seq: 1, at: t(2) }),
      )
      expect(s1.people.emp_an?.activity).toBe('idle')
      expect(s1.people.emp_quan?.activity).toBe('idle')
      expect(s1.help[help.id]?.status).toBe('answered')
    })
  })
})

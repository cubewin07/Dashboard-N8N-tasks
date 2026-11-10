import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ev,
  makeConfig,
  makeEvent,
  makeSampleTask,
  makeSeedConfig,
  t,
} from '../__fixtures__/builders'
import { EVENT_TYPES, parseEvent, type EventType, type OfficeEvent } from '../events'
import { apply, initialState } from '../reducer'
import {
  activitySentenceParts,
  archivedStaff,
  bossQueue,
  floorSummary,
  idlePeople,
  orgTree,
  peopleByDepartment,
  pileFor,
  queueFor,
  tempStaff,
  waitingSeatsFor,
  whyLevel,
} from '../selectors'

const fixturesDir = path.resolve(import.meta.dirname, '../__fixtures__/events')

describe('domain selectors (P01 + P03-T06)', () => {
  it('groups peopleByDepartment sorted by role sortOrder then createdAt then id', () => {
    const cfg = makeConfig({
      employees: [
        ...makeConfig().employees,
        {
          id: 'emp_linh',
          name: 'Linh',
          departmentId: 'dep_cs',
          roleKey: 'lead',
          specialties: ['customer_chat'],
          kind: 'core',
          state: 'active',
          reviewMode: 'always',
          modelTierOverride: null,
          bio: null,
          createdAt: '2026-11-10T00:00:00Z',
          createdBy: 'seed',
          archivedAt: null,
        },
      ],
    })
    const grouped = peopleByDepartment(cfg)
    expect(grouped.dep_cs?.map((e) => e.id)).toEqual([
      'emp_ngoc',
      'emp_linh',
      'emp_mai',
    ])
    expect(grouped.building?.map((e) => e.id)).toEqual(['emp_owner_1', 'emp_thu'])
  })

  it('builds orgTree top to bottom with boss floor first and management second', () => {
    const cfg = makeConfig({
      departments: [
        ...makeConfig().departments,
        {
          id: 'dep_mkt',
          key: 'marketing',
          label: { vi: 'Marketing', en: 'Marketing' },
          order: 2,
          colorSwatch: 'marketing',
          icon: 'Megaphone',
          hours: 'office',
          floorTemplate: 'department',
          active: true,
        },
        {
          id: 'dep_inactive',
          key: 'inactive_dept',
          label: { vi: 'Ngừng', en: 'Inactive' },
          order: 3,
          colorSwatch: 'cs',
          icon: 'Box',
          hours: 'office',
          floorTemplate: 'department',
          active: false,
        },
      ],
    })
    const tree = orgTree(cfg)
    expect(tree.map((f) => f.floorKey)).toEqual([
      'boss',
      'management',
      'marketing',
      'cs',
    ])
    expect(tree[0]?.kind).toBe('boss')
    expect(tree[0]?.people.map((p) => p.employee.id)).toEqual(['emp_owner_1'])
    expect(tree[1]?.kind).toBe('management')
    expect(tree[1]?.people.map((p) => p.employee.id)).toEqual(['emp_thu'])
    expect(tree[2]?.department?.key).toBe('marketing')
    expect(tree[2]?.people).toEqual([])
    expect(tree[3]?.department?.key).toBe('cs')
    expect(tree[3]?.people.map((p) => p.employee.id)).toEqual([
      'emp_ngoc',
      'emp_mai',
    ])
  })

  it('computes pileFor, bossQueue, floorSummary, whyLevel, waitingSeatsFor, queueFor, idlePeople, and tempStaff with memoisation', () => {
    let s = initialState(makeSeedConfig(), t(0))

    const refundTask = makeSampleTask({
      id: 'task_refund',
      title: 'Hoàn tiền đơn lỗi',
      departmentId: 'dep_cs',
      assigneeId: 'emp_mai',
      tags: ['refund', 'money'],
      priority: 'urgent',
      requiredLevel: 'boss',
      matchedRuleIds: ['boss_sensitive'],
    })
    const routineTask = makeSampleTask({
      id: 'task_routine',
      title: 'Trả lời tin nhắn mẫu',
      departmentId: 'dep_cs',
      assigneeId: 'emp_trang',
      tags: ['routine_draft'],
      priority: 'normal',
      requiredLevel: 'reviewer',
      matchedRuleIds: ['reviewer_routine'],
    })

    s = apply(s, ev.taskCreated(refundTask, 1, t(1)))
    s = apply(s, ev.taskCreated(routineTask, 2, t(2)))
    s = apply(s, makeEvent('task.started', { taskId: 'task_routine' }, { seq: 3, at: t(3) }))

    // Request boss review on refundTask and reviewer review on routineTask
    s = apply(
      s,
      makeEvent(
        'review.requested',
        {
          review: {
            id: 'rev_boss_1',
            taskId: 'task_refund',
            level: 'boss',
            assigneeId: 'emp_giam_doc',
            status: 'pending',
            priority: 'urgent',
            createdAt: t(4),
            decidedAt: null,
            decidedBy: null,
            note: null,
          },
        },
        { seq: 4, at: t(4) },
      ),
    )
    s = apply(
      s,
      makeEvent(
        'review.requested',
        {
          review: {
            id: 'rev_an_1',
            taskId: 'task_routine',
            level: 'reviewer',
            assigneeId: 'emp_an',
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

    // Ask owner a question (normal priority) and ask emp_ngoc an in-person question
    s = apply(
      s,
      makeEvent(
        'question.asked',
        {
          question: {
            id: 'q_boss_1',
            taskId: 'task_routine',
            fromId: 'emp_trang',
            toId: 'emp_giam_doc',
            text: 'Sếp duyệt mẫu câu này giúp em?',
            status: 'open',
            inPerson: false,
            createdAt: t(6),
            answeredAt: null,
          },
        },
        { seq: 6, at: t(6) },
      ),
    )
    s = apply(
      s,
      makeEvent(
        'question.asked',
        {
          question: {
            id: 'q_ngoc_1',
            taskId: 'task_refund',
            fromId: 'emp_mai',
            toId: 'emp_ngoc',
            text: 'Chị Ngọc xem giúp đơn này',
            status: 'open',
            inPerson: true,
            createdAt: t(7),
            answeredAt: null,
          },
        },
        { seq: 7, at: t(7) },
      ),
    )

    // pileFor
    const bossPile1 = pileFor(s, 'emp_giam_doc')
    const bossPile2 = pileFor('emp_giam_doc', s)
    expect(bossPile1).toBe(bossPile2) // memoised reference
    expect(bossPile1.map((r) => r.id)).toEqual(['rev_boss_1'])
    expect(pileFor(s, 'emp_an').map((r) => r.id)).toEqual(['rev_an_1'])

    // bossQueue orders urgent review before normal question
    const bq1 = bossQueue(s)
    const bq2 = bossQueue(s)
    expect(bq1).toBe(bq2) // memoised
    expect(bq1.map((x) => x.id)).toEqual(['rev_boss_1', 'q_boss_1'])
    expect(bq1[0]?.matchedRules.map((r) => r.id)).toEqual(['boss_sensitive'])

    // whyLevel
    const why = whyLevel(s, 'task_refund')
    expect(why.level).toBe('boss')
    expect(why.isDefault).toBe(false)
    expect(why.matchedRules[0]?.id).toBe('boss_sensitive')

    // floorSummary for cs and boss
    const csSummary = floorSummary(s, 'cs')
    expect(csSummary.reviewPile).toBe(1) // rev_an_1
    expect(csSummary.waiting).toBeGreaterThanOrEqual(1) // emp_mai waiting_answer + emp_trang asking
    const bossSummary = floorSummary('boss', s)
    expect(bossSummary.reviewPile).toBe(1) // rev_boss_1

    // waitingSeatsFor
    expect(waitingSeatsFor(s, 'emp_ngoc').map((q) => q.id)).toEqual(['q_ngoc_1'])

    // queueFor
    expect(queueFor(s, 'emp_mai').map((tItem) => tItem.id)).toEqual(['task_refund'])

    // idlePeople, tempStaff, archivedStaff
    expect(idlePeople(s).length).toBeGreaterThan(10)
    expect(tempStaff(s)).toEqual([])
    expect(archivedStaff(s)).toEqual([])
  })

  it('builds activitySentenceParts for every event type in EVENT_TYPES', () => {
    const s = initialState(makeSeedConfig(), t(0))
    for (const type of EVENT_TYPES) {
      const raw = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, `${type}.valid.json`), 'utf8'),
      )
      const parsed = parseEvent(raw)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) continue
      const parts = activitySentenceParts(parsed.event as OfficeEvent<EventType>, s)
      expect(parts.type).toBe(type)
      expect(parts.actorName.length).toBeGreaterThan(0)
      expect(['work', 'review', 'help_question', 'staff', 'system']).toContain(
        parts.category,
      )
    }
  })
})

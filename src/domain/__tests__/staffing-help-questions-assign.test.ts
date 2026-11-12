import { describe, expect, it } from 'vitest'
import { canRetryTask, pickWorker } from '../assign'
import {
  DEFAULT_POLICY,
  ev,
  makeConfig,
  makeEvent,
  makeSampleTask,
  makeSeedConfig,
  t,
} from '../__fixtures__/builders'
import { onHelpTimeout, pickHelper } from '../help'
import type { EmployeeId } from '../primitives'
import { canAsk, isInPerson } from '../questions'
import { apply, initialState } from '../reducer'
import { longestIdleTemp, planHire } from '../staffing'

describe('staffing, help, questions, and assignment (P03-T05)', () => {
  describe('staffing (R6)', () => {
    it('handles under cap, at cap with eligible idle temp, at cap none eligible + manager -> needs_boss, boss -> hire, and never drops core', () => {
      const cfg = makeConfig({
        policy: {
          ...DEFAULT_POLICY,
          staffing: {
            tempCap: 2,
            dropOrder: 'longest_idle_first',
            minIdleMinutesBeforeDrop: 60,
          },
        },
      })
      let s = initialState(cfg, t(0))

      // Core staff idle for 200 minutes are NEVER returned by longestIdleTemp
      expect(longestIdleTemp(s, t(200))).toBeNull()

      // 1. Under cap -> hire
      expect(planHire({ requestedBy: 'manager' }, s, t(10))).toEqual({
        kind: 'hire',
      })

      // Hire 2 temps at t(10) and t(20)
      s = apply(
        s,
        makeEvent(
          'staff.hired',
          {
            employee: {
              id: 'emp_temp_1',
              name: 'Tạm 1',
              departmentId: 'dep_cs',
              roleKey: 'worker',
              specialties: ['customer_chat'],
              kind: 'temp',
              state: 'active',
              reviewMode: 'always',
              modelTierOverride: null,
              bio: null,
              createdAt: t(10),
              createdBy: 'manager',
              archivedAt: null,
            },
          },
          { seq: 1, at: t(10) },
        ),
      )
      s = apply(
        s,
        makeEvent(
          'staff.hired',
          {
            employee: {
              id: 'emp_temp_2',
              name: 'Tạm 2',
              departmentId: 'dep_cs',
              roleKey: 'worker',
              specialties: ['customer_chat'],
              kind: 'temp',
              state: 'active',
              reviewMode: 'always',
              modelTierOverride: null,
              bio: null,
              createdAt: t(20),
              createdBy: 'manager',
              archivedAt: null,
            },
          },
          { seq: 2, at: t(20) },
        ),
      )

      // 2. At cap (2), at t(50) neither temp has been idle >= 60 min
      expect(longestIdleTemp(s, t(50))).toBeNull()
      expect(planHire({ requestedBy: 'manager' }, s, t(50))).toEqual({
        kind: 'needs_boss',
      })

      // 3. Boss-issued hire at cap with none eligible proceeds anyway
      expect(planHire({ requestedBy: 'boss' }, s, t(50))).toEqual({
        kind: 'hire',
      })
      expect(planHire({ ignoreCap: true }, s, t(50))).toEqual({
        kind: 'hire',
      })

      // 4. At t(90), emp_temp_1 has been idle 80 min and emp_temp_2 idle 70 min -> archives emp_temp_1
      expect(longestIdleTemp(s, t(90))).toBe('emp_temp_1')
      expect(planHire({ requestedBy: 'manager' }, s, t(90))).toEqual({
        kind: 'hire_after_archive',
        archiveId: 'emp_temp_1',
      })
    })
  })

  describe('help requests (R7)', () => {
    it('retries on round 1 timeout with a different helper and escalates on round 2 timeout', () => {
      let s = initialState(makeSeedConfig(), t(0))
      const firstHelper = pickHelper('customer_chat', s, ['emp_mai'])
      expect(firstHelper).toBe('emp_ngoc')

      // Round 1 timeout -> retry
      expect(onHelpTimeout({ round: 1 }, DEFAULT_POLICY)).toBe('retry')

      // Pick a different helper excluding the asker and first helper
      const secondHelper = pickHelper('customer_chat', s, [
        'emp_mai',
        firstHelper as EmployeeId,
      ])
      expect(secondHelper).toBe('emp_quan')

      // If emp_ngoc is working and emp_quan is idle, idle emp_quan is preferred
      s = {
        ...s,
        people: {
          ...s.people,
          emp_ngoc: {
            ...s.people.emp_ngoc!,
            activity: 'working',
            lastActiveAt: t(5),
          },
        },
      }
      expect(pickHelper('customer_chat', s, ['emp_mai'])).toBe('emp_quan')
      expect(pickHelper('unknown_spec', s, [])).toBeNull()

      // Round 2 timeout -> escalate
      expect(onHelpTimeout({ round: 2 }, DEFAULT_POLICY)).toBe('escalate')
    })
  })

  describe('questions (R8)', () => {
    it('refuses a second question on the same task and sets inPerson at questionSeatThreshold (3)', () => {
      let s = initialState(makeSeedConfig(), t(0))
      s = apply(s, ev.taskCreated({ id: 'task_1', assigneeId: 'emp_mai' }, 1, t(1)))

      expect(canAsk('task_1', s)).toBe(true)
      expect(isInPerson('emp_linh', s)).toBe(false)

      // First question on task_1
      s = apply(
        s,
        makeEvent(
          'question.asked',
          {
            question: {
              id: 'q_1',
              taskId: 'task_1',
              fromId: 'emp_mai',
              toId: 'emp_linh',
              text: 'Câu 1?',
              status: 'open',
              inPerson: false,
              createdAt: t(2),
              answeredAt: null,
            },
          },
          { seq: 2, at: t(2) },
        ),
      )

      // Second question on task_1 is refused (maxQuestionsPerTask = 1)
      expect(canAsk('task_1', s)).toBe(false)

      // Add 2 more open questions to emp_linh from other tasks -> reaches threshold 3
      s = apply(s, ev.taskCreated({ id: 'task_2', assigneeId: 'emp_trang' }, 3, t(3)))
      s = apply(s, ev.taskCreated({ id: 'task_3', assigneeId: 'emp_phuc' }, 4, t(4)))
      s = apply(
        s,
        makeEvent(
          'question.asked',
          {
            question: {
              id: 'q_2',
              taskId: 'task_2',
              fromId: 'emp_trang',
              toId: 'emp_linh',
              text: 'Câu 2?',
              status: 'open',
              inPerson: false,
              createdAt: t(5),
              answeredAt: null,
            },
          },
          { seq: 5, at: t(5) },
        ),
      )
      expect(isInPerson('emp_linh', s)).toBe(false)

      s = apply(
        s,
        makeEvent(
          'question.asked',
          {
            question: {
              id: 'q_3',
              taskId: 'task_3',
              fromId: 'emp_phuc',
              toId: 'emp_linh',
              text: 'Câu 3?',
              status: 'open',
              inPerson: false,
              createdAt: t(6),
              answeredAt: null,
            },
          },
          { seq: 6, at: t(6) },
        ),
      )
      expect(isInPerson('emp_linh', s)).toBe(true)
    })
  })

  describe('assignment and retry (R9)', () => {
    it('picks an idle specialty-matching worker and returns null when busy', () => {
      let s = initialState(makeSeedConfig(), t(0))
      const worker = pickWorker({ specialty: 'customer_chat' }, 'dep_cs', s)
      expect(worker).toBe('emp_mai')

      // Start a task on emp_mai -> emp_mai is now busy (oneActiveTaskPerWorker)
      s = apply(
        s,
        ev.taskCreated(
          makeSampleTask({ id: 'task_active', assigneeId: 'emp_mai' }),
          1,
          t(1),
        ),
      )
      s = apply(
        s,
        makeEvent('task.started', { taskId: 'task_active' }, { seq: 2, at: t(2) }),
      )

      // No other dedicated worker in dep_cs has customer_chat (emp_ngoc is dept_manager, emp_quan is reviewer)
      expect(pickWorker({ specialty: 'customer_chat' }, 'dep_cs', s)).toBeNull()

      // String taskType key lookup + multiple worker candidates sorting
      s = apply(
        s,
        makeEvent(
          'staff.hired',
          {
            employee: {
              id: 'emp_temp_cs1',
              name: 'CS Tạm 1',
              departmentId: 'dep_cs',
              roleKey: 'worker',
              specialties: ['customer_chat'],
              kind: 'temp',
              state: 'active',
              reviewMode: 'always',
              modelTierOverride: null,
              bio: null,
              createdAt: t(3),
              createdBy: 'manager',
              archivedAt: null,
            },
          },
          { seq: 3, at: t(3) },
        ),
      )
      s = apply(
        s,
        makeEvent(
          'staff.hired',
          {
            employee: {
              id: 'emp_temp_cs2',
              name: 'CS Tạm 2',
              departmentId: 'dep_cs',
              roleKey: 'worker',
              specialties: ['customer_chat'],
              kind: 'temp',
              state: 'active',
              reviewMode: 'always',
              modelTierOverride: null,
              bio: null,
              createdAt: t(4),
              createdBy: 'manager',
              archivedAt: null,
            },
          },
          { seq: 4, at: t(4) },
        ),
      )
      expect(pickWorker('cs.chat_order_status', 'dep_cs', s)).toBe(
        'emp_temp_cs1',
      )

      expect(canRetryTask({ attempts: 1 }, DEFAULT_POLICY)).toBe(true)
      expect(canRetryTask({ attempts: 2 }, DEFAULT_POLICY)).toBe(true)
      expect(canRetryTask({ attempts: 3 }, DEFAULT_POLICY)).toBe(false)
    })
  })
})

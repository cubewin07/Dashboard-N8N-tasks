import { describe, expect, it } from 'vitest'
import { makeSampleTask, makeSeedConfig, makeState, t } from '@/domain/__fixtures__/builders'
import type { EmployeeId, QuestionId } from '@/domain/primitives'
import type { OfficeState, Question } from '@/domain/work'
import { personFacts, waitingPositionFor } from '../personFactsModel'

function question(
  n: number,
  fromId: EmployeeId,
  toId: EmployeeId,
  over: Partial<Question> = {},
): Question {
  return {
    id: `q_${String(n).padStart(3, '0')}` as QuestionId,
    taskId: 'task_01JTEST000000000000000001',
    fromId,
    toId,
    text: 'Hỏi nhanh',
    status: 'open',
    inPerson: true,
    createdAt: t(n),
    answeredAt: null,
    ...over,
  }
}

function withQuestions(state: OfficeState, qs: Question[]): OfficeState {
  return { ...state, questions: Object.fromEntries(qs.map((q) => [q.id, q])) }
}

describe('personFactsModel (P05-T14, R13)', () => {
  const base = makeState(makeSeedConfig())

  it('gives the 1-based waiting position from the domain order of arrival', () => {
    const state = withQuestions(base, [
      question(3, 'emp_bao', 'emp_hai'),
      question(1, 'emp_duy', 'emp_hai'),
      question(2, 'emp_thao', 'emp_hai'),
      // walk-up (not in person) and answered questions take no seat
      question(0, 'emp_mai', 'emp_hai', { inPerson: false }),
      question(4, 'emp_trang', 'emp_hai', { status: 'answered', answeredAt: t(5) }),
    ])
    expect(waitingPositionFor(state, 'emp_duy')).toEqual({ targetId: 'emp_hai', position: 1 })
    expect(waitingPositionFor(state, 'emp_thao')).toEqual({ targetId: 'emp_hai', position: 2 })
    expect(waitingPositionFor(state, 'emp_bao')).toEqual({ targetId: 'emp_hai', position: 3 })
    expect(waitingPositionFor(state, 'emp_mai')).toBeNull()
    expect(waitingPositionFor(state, 'emp_trang')).toBeNull()
    expect(waitingPositionFor(state, 'emp_ha')).toBeNull()
  })

  it('collects status, task, platform, carrying, pile and waiting', () => {
    const task = makeSampleTask({ assigneeId: 'emp_mai', platformKey: 'zalo_oa', title: 'Trả lời Zalo' })
    const state: OfficeState = withQuestions(
      {
        ...base,
        tasks: { [task.id]: task },
        people: {
          ...base.people,
          emp_mai: {
            ...base.people.emp_mai!,
            activity: 'waiting_answer',
            taskId: task.id,
            carrying: 'phone',
            platformKey: null,
          },
        },
      },
      [question(1, 'emp_mai', 'emp_ngoc')],
    )
    const facts = personFacts(state, 'emp_mai')
    expect(facts).toMatchObject({
      activity: 'waiting_answer',
      taskTitle: 'Trả lời Zalo',
      platformKey: 'zalo_oa',
      carrying: 'phone',
      pileCount: 0,
      waiting: { targetId: 'emp_ngoc', position: 1 },
    })
  })

  it('falls back to idle with nothing for an unknown person', () => {
    expect(personFacts(base, 'emp_nobody')).toMatchObject({
      activity: 'idle',
      taskTitle: '',
      platformKey: null,
      carrying: null,
      waiting: null,
    })
  })
})

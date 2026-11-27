import { describe, expect, it } from 'vitest'
import { makeEvent, makeSampleTask } from '@/domain/__fixtures__/builders'
import type { EmployeeId, QuestionId, TaskId } from '@/domain/primitives'
import { allocateSeats, benchOf, LINE_SPACING, linePoint, seatFor } from '../seating'
import { makeWorld } from './harness'

describe('seatFor / allocateSeats (P05-T07, pure)', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f']

  it('6 in-person questions, capacity 4 → 4 seated in arrival order, 2 in line', () => {
    const places = seatFor(six, 4)
    expect(places.map((p) => [p.id, p.seated, p.seat, p.line])).toEqual([
      ['a', true, 0, -1],
      ['b', true, 1, -1],
      ['c', true, 2, -1],
      ['d', true, 3, -1],
      ['e', false, -1, 0],
      ['f', false, -1, 1],
    ])
    expect(places.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('the line stands 0.6 m apart behind the bench', () => {
    const origin = { x: 6, z: 12 }
    const dir = { x: 0, z: 1 }
    const p0 = linePoint(origin, dir, 0)
    const p1 = linePoint(origin, dir, 1)
    expect(LINE_SPACING).toBe(0.6)
    expect(Math.hypot(p0.x - origin.x, p0.z - origin.z)).toBeCloseTo(0.6)
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeCloseTo(0.6)
  })

  it('answering #1 does not reshuffle the seated: the line moves into the freed seat', () => {
    const before = seatFor(six, 4)
    const previous = new Map(before.filter((p) => p.seated).map((p) => [p.id, p.seat]))
    const after = allocateSeats(six.slice(1), 4, previous)
    const seatOf = Object.fromEntries(after.map((p) => [p.id, p.seat]))
    expect(seatOf).toEqual({ b: 1, c: 2, d: 3, e: 0, f: -1 })
    expect(after.find((p) => p.id === 'f')).toMatchObject({ seated: false, line: 0, index: 4 })
  })

  it('every floor with a room has a bench (management and boss included)', () => {
    const w = makeWorld('bench')
    for (const key of ['cs', 'marketing', 'management', 'boss']) {
      const floor = w.layout.floors[w.layout.byKey[key]!]!
      const bench = benchOf(floor)
      expect(bench, key).not.toBeNull()
      expect(bench!.seats.length).toBeGreaterThanOrEqual(4)
      expect(Math.hypot(bench!.dir.x, bench!.dir.z)).toBeCloseTo(1)
    }
  })
})

describe('waiting seats in the director (P05-T07)', () => {
  const MANAGER = 'emp_hai' as EmployeeId
  const ASKERS = ['emp_ha', 'emp_khanh', 'emp_yen', 'emp_duy', 'emp_bao', 'emp_thao'] as EmployeeId[]

  function queue() {
    const w = makeWorld('bench-queue')
    w.run(0.2)
    ASKERS.forEach((from, i) => {
      const taskId = `task_q_${i}` as TaskId
      w.emit((seq, at, id) =>
        makeEvent(
          'task.created',
          {
            task: makeSampleTask({
              id: taskId,
              departmentId: 'dep_marketing',
              assigneeId: from,
              status: 'in_progress',
              createdAt: at,
            }),
          },
          { seq, at, id },
        ),
      )
      w.emit((seq, at, id) =>
        makeEvent(
          'question.asked',
          {
            question: {
              id: `q_bench_${i}` as QuestionId,
              taskId,
              fromId: from,
              toId: MANAGER,
              text: 'Anh xem giúp em?',
              status: 'open',
              inPerson: true,
              createdAt: at,
              answeredAt: null,
            },
          },
          { seq, at, id },
        ),
      )
      w.run(0.2)
    })
    return w
  }

  it('seats the first four in arrival order and lines up the rest 0.6 m apart', () => {
    const w = queue()
    const spots = ASKERS.map((id) => w.director.waitingOf(id))
    expect(spots.map((s) => s?.index)).toEqual([0, 1, 2, 3, 4, 5])
    expect(spots.map((s) => s?.seated)).toEqual([true, true, true, true, false, false])
    expect(spots.every((s) => s?.nearEmployeeId === MANAGER)).toBe(true)
    expect(w.director.waitingOf('emp_mai' as EmployeeId)).toBeNull()

    const settled = w.run(120, () => ASKERS.every((id) => w.debug(id)!.action === 'hold'))
    expect(settled).toBeGreaterThan(0)
    for (const id of ASKERS.slice(0, 4)) expect(w.director.person(id)!.pose).toBe('wait_seat')
    for (const id of ASKERS.slice(4)) expect(w.director.person(id)!.pose).toBe('wait_stand')
    const [e, f] = ASKERS.slice(4).map((id) => w.director.person(id)!)
    expect(Math.hypot(e!.x - f!.x, e!.z - f!.z)).toBeCloseTo(LINE_SPACING, 1)
    expect(w.director.stats().teleports).toBe(0)
  })

  it('answering #1 keeps the others in their seats; the line moves up', () => {
    const w = queue()
    w.run(120, () => ASKERS.every((id) => w.debug(id)!.action === 'hold'))
    const seatsBefore = ASKERS.slice(1, 4).map((id) => {
      const p = w.director.person(id)!
      return { x: p.x, z: p.z }
    })
    w.emit((seq, at, id) =>
      makeEvent('question.answered', { questionId: 'q_bench_0' as QuestionId, answer: 'Được' }, { seq, at, id }),
    )
    expect(w.director.waitingOf(ASKERS[0]!)).toBeNull()
    expect(w.director.waitingOf(ASKERS[4]!)).toMatchObject({ seated: true, index: 3 })
    expect(w.director.waitingOf(ASKERS[5]!)).toMatchObject({ seated: false, index: 4 })

    w.run(60, () => w.director.person(ASKERS[4]!)!.pose === 'wait_seat')
    expect(w.director.person(ASKERS[4]!)!.pose).toBe('wait_seat')
    ASKERS.slice(1, 4).forEach((id, i) => {
      const p = w.director.person(id)!
      expect(p.pose).toBe('wait_seat')
      expect(p.x).toBeCloseTo(seatsBefore[i]!.x, 5)
      expect(p.z).toBeCloseTo(seatsBefore[i]!.z, 5)
    })
  })
})

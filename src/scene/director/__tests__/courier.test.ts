import { describe, expect, it } from 'vitest'
import { makeEvent, makeSampleTask } from '@/domain/__fixtures__/builders'
import type { EmployeeId, ReviewId, TaskId } from '@/domain/primitives'
import { pileFor } from '@/domain/selectors'
import { heldItemFor } from '../held'
import { pileSheets, pileVisualCount } from '../transit'
import { makeWorld } from './harness'

const COURIER = 'emp_mai' as EmployeeId // cs floor
const APPROVER = 'emp_thu' as EmployeeId // management floor
const TASK = 'task_courier_1' as TaskId

/** mai finishes a task on the cs floor; the review goes to thu on the management floor. */
function crossFloorReview() {
  const w = makeWorld('courier')
  w.run(0.5)
  w.emit((seq, at, id) =>
    makeEvent(
      'task.created',
      { task: makeSampleTask({ id: TASK, assigneeId: COURIER, createdAt: at }) },
      { seq, at, id },
    ),
  )
  w.emit((seq, at, id) =>
    makeEvent(
      'review.requested',
      {
        review: {
          id: 'rev_courier_1' as ReviewId,
          taskId: TASK,
          level: 'reviewer',
          assigneeId: APPROVER,
          status: 'pending',
          priority: 'normal',
          createdAt: at,
          decidedAt: null,
          decidedBy: null,
          note: null,
        },
      },
      { seq, at, id, actor: { kind: 'employee', id: COURIER } },
    ),
  )
  return w
}

describe('courier trips (P05-T05, P05-T06)', () => {
  it('cross-floor review: walk → elevator → walk → face → drop at the pile', () => {
    const w = crossFloorReview()
    w.run(0.1)
    const plan = w.director.planOf(COURIER)
    const kinds = plan.map((a) => a.k)
    const pickIdx = kinds.indexOf('pick')
    expect(pickIdx).toBeGreaterThanOrEqual(0)
    expect(kinds.slice(pickIdx)).toEqual([
      'pick',
      'walk',
      'callElevator',
      'ride',
      'exitElevator',
      'walk',
      'face',
      'drop',
      'wait',
    ])
    const drop = plan.find((a) => a.k === 'drop')
    expect(drop && drop.k === 'drop' ? drop.at : '').toMatch(/::manager_office\.pile$/)
  })

  it('the paper is in hand only between pick and drop; the 3D pile lags until the drop', () => {
    const w = crossFloorReview()
    // 2D truth: the pile has the paper at event time (D5).
    expect(pileFor(w.state, APPROVER)).toHaveLength(1)
    expect(w.director.inTransit(APPROVER)).toBe(1)
    expect(pileVisualCount(pileFor(w.state, APPROVER).length, w.director.inTransit(APPROVER))).toBe(0)

    w.run(0.1)
    const kinds = w.director.planOf(COURIER).map((a) => a.k)
    const pickIdx = kinds.indexOf('pick')
    const dropIdx = kinds.indexOf('drop')
    let sawPaper = false
    let delivered = -1
    const ticks = w.run(240, () => {
      const step = w.debug(COURIER)!.step
      const carrying = w.director.person(COURIER)!.carrying
      if (step > pickIdx && step <= dropIdx) {
        expect(carrying).toBe('document')
        expect(w.director.inTransit(APPROVER)).toBe(1)
        sawPaper = true
      } else if (step > dropIdx) {
        expect(carrying).toBeNull()
        if (delivered < 0) delivered = step
      } else if (step < pickIdx) {
        expect(carrying).toBeNull()
      }
      return delivered >= 0
    })
    expect(ticks).toBeGreaterThan(0)
    expect(sawPaper).toBe(true)
    expect(w.director.inTransit(APPROVER)).toBe(0)
    expect(pileVisualCount(pileFor(w.state, APPROVER).length, w.director.inTransit(APPROVER))).toBe(1)
    expect(w.director.stats().teleports).toBe(0)
  })

  it('a hand-off drops the paper on the new owner’s desk, not on a pile', () => {
    const w = makeWorld('handoff')
    w.run(0.5)
    w.emit((seq, at, id) =>
      makeEvent(
        'task.created',
        { task: makeSampleTask({ id: TASK, assigneeId: COURIER, createdAt: at }) },
        { seq, at, id },
      ),
    )
    w.emit((seq, at, id) =>
      makeEvent(
        'task.handed_off',
        { taskId: TASK, fromId: COURIER, toId: 'emp_duy' as EmployeeId },
        { seq, at, id },
      ),
    )
    w.run(0.1)
    const drop = w.director.planOf(COURIER).find((a) => a.k === 'drop')
    expect(drop?.k).toBe('drop')
    expect(drop && drop.k === 'drop' ? drop.at : '').toMatch(/^marketing::desk_\d+$/)
    // Hand-offs are not review papers: no pile accounting.
    expect(w.director.inTransit('emp_duy' as EmployeeId)).toBe(0)
  })

  it('pileSheets caps the drawn sheets, the count keeps going', () => {
    expect(pileSheets(45, 30)).toBe(30)
    expect(pileSheets(3, 30)).toBe(3)
    expect(pileVisualCount(2, 5)).toBe(0)
  })
})

describe('heldItemFor (P05-T04)', () => {
  it('the held prop follows the task type while working at the desk', () => {
    expect(heldItemFor('working', 'laptop', 'WorkAtDesk')).toBe('laptop')
    expect(heldItemFor('working', 'camera', 'WorkAtDesk')).toBe('camera')
    expect(heldItemFor('working', 'phone', 'WorkAtDesk')).toBe('phone')
    expect(heldItemFor('working', null, 'WorkAtDesk')).toBeNull()
  })

  it('reviewers hold a sheet; idle, walking and resting people hold nothing', () => {
    expect(heldItemFor('reviewing', null, 'ReviewAtDesk')).toBe('document')
    expect(heldItemFor('idle', 'laptop', 'IdleAtDesk')).toBeNull()
    expect(heldItemFor('working', 'laptop', 'GoToDesk')).toBeNull()
    expect(heldItemFor('resting', null, 'NapAtDesk')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  ev,
  makeEvent,
  makeSampleTask,
  makeSeedConfig,
  t,
} from '@/domain/__fixtures__/builders'
import { apply, initialState } from '@/domain/reducer'
import { floorSummary } from '@/domain/selectors'
import { buildFloorChips, formatFloorChipsText } from '../FloorLabel'

describe('FloorLabel chips (P03-T15)', () => {
  it('builds and formats floor chips from floorSummary for cs department in vi', () => {
    let state = initialState(makeSeedConfig(), t(0))

    const viLabels = {
      chipWorking: 'đang làm {n}',
      chipWaiting: 'đang chờ {n}',
      chipReviewPile: 'chờ duyệt {n}',
    }

    // Baseline: cs floor initially has 0 working, 0 waiting, 0 reviewPile
    let summary = floorSummary(state, 'cs')
    let chips = buildFloorChips(summary, viLabels)

    expect(chips).toEqual([
      { id: 'working', text: `đang làm ${summary.working}`, swatchKey: 'working' },
      { id: 'waiting', text: `đang chờ ${summary.waiting}`, swatchKey: 'waiting' },
      { id: 'reviewPile', text: `chờ duyệt ${summary.reviewPile}`, swatchKey: 'boss' },
    ])
    expect(formatFloorChipsText(chips)).toBe(
      `đang làm ${summary.working}  ·  đang chờ ${summary.waiting}  ·  chờ duyệt ${summary.reviewPile}`,
    )

    // Advance state: add a task assigned to cs (waiting)
    const task = makeSampleTask({
      id: 'task_cs_refund',
      departmentId: 'dep_cs',
      assigneeId: 'emp_mai',
      title: 'Hỗ trợ đổi trả đơn Shopee',
      priority: 'high',
      requiredLevel: 'reviewer',
    })
    state = apply(state, ev.taskCreated(task, 1, t(1)))

    // Start task (working)
    state = apply(
      state,
      makeEvent('task.started', { taskId: 'task_cs_refund' }, { seq: 2, at: t(2) }),
    )

    // Request review (reviewPile)
    state = apply(
      state,
      makeEvent(
        'review.requested',
        {
          review: {
            id: 'rev_1',
            taskId: 'task_cs_refund',
            assigneeId: 'emp_mai',
            level: 'reviewer',
            priority: 'high',
            status: 'pending',
            createdAt: t(3),
            decidedAt: null,
            decidedBy: null,
            note: null,
          },
        },
        { seq: 3, at: t(3) },
      ),
    )

    summary = floorSummary(state, 'cs')
    chips = buildFloorChips(summary, viLabels)

    expect(chips).toHaveLength(3)
    expect(chips[0]!.id).toBe('working')
    expect(chips[0]!.text).toBe(`đang làm ${summary.working}`)
    expect(chips[1]!.id).toBe('waiting')
    expect(chips[1]!.text).toBe(`đang chờ ${summary.waiting}`)
    expect(chips[2]!.id).toBe('reviewPile')
    expect(chips[2]!.text).toBe(`chờ duyệt ${summary.reviewPile}`)

    const formatted = formatFloorChipsText(chips)
    expect(formatted).toBe(
      `đang làm ${summary.working}  ·  đang chờ ${summary.waiting}  ·  chờ duyệt ${summary.reviewPile}`,
    )
    expect(formatted).toContain('  ·  ')
  })

  it('formats floor chips with en labels', () => {
    const state = initialState(makeSeedConfig(), t(0))
    const summary = floorSummary(state, 'cs')
    const enLabels = {
      chipWorking: 'working {n}',
      chipWaiting: 'waiting {n}',
      chipReviewPile: 'review pile {n}',
    }
    const chips = buildFloorChips(summary, enLabels)
    expect(formatFloorChipsText(chips)).toBe(
      `working ${summary.working}  ·  waiting ${summary.waiting}  ·  review pile ${summary.reviewPile}`,
    )
  })
})

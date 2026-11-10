import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POLICY,
  ev,
  makeEvent,
  makeSampleTask,
  makeSeedConfig,
  t,
} from '../__fixtures__/builders'
import { apply, initialState } from '../reducer'
import {
  chainFor,
  nextInChain,
  pickApprover,
  pickLeadForDepartment,
} from '../reviews'

describe('review chain and approver picking (P03-T04)', () => {
  it('yields reviewer -> dept_manager -> boss under every_level_up_to_required and single level under required_only', () => {
    expect(chainFor('boss', DEFAULT_POLICY)).toEqual([
      'reviewer',
      'dept_manager',
      'boss',
    ])
    expect(chainFor('dept_manager', DEFAULT_POLICY)).toEqual([
      'reviewer',
      'dept_manager',
    ])
    expect(chainFor('reviewer', DEFAULT_POLICY)).toEqual(['reviewer'])

    const requiredOnlyPolicy = {
      ...DEFAULT_POLICY,
      approvals: { ...DEFAULT_POLICY.approvals, chain: 'required_only' as const },
    }
    expect(chainFor('boss', requiredOnlyPolicy)).toEqual(['boss'])
    expect(chainFor('dept_manager', requiredOnlyPolicy)).toEqual(['dept_manager'])

    // reviewMode: when_important skips reviewer level on routine_draft when required level is reviewer
    expect(
      chainFor('reviewer', DEFAULT_POLICY, {
        workerReviewMode: 'when_important',
        taskTags: ['routine_draft'],
      }),
    ).toEqual([])
  })

  it('picks least-loaded reviewer in department, department manager, and least-loaded boss', () => {
    let s = initialState(makeSeedConfig(), t(0))
    const csTask = makeSampleTask({ id: 'task_1', departmentId: 'dep_cs' })

    // Lead for CS is emp_linh
    expect(pickLeadForDepartment('dep_cs', s)).toBe('emp_linh')

    // CS reviewers are emp_an and emp_quan; tie broken by id -> emp_an first
    expect(pickApprover('reviewer', csTask, s)).toBe('emp_an')

    // Give emp_an 1 pending review -> emp_quan is now least-loaded
    s = apply(s, ev.taskCreated(csTask, 1, t(1)))
    s = apply(
      s,
      makeEvent(
        'review.requested',
        {
          review: {
            id: 'rev_1',
            taskId: 'task_1',
            level: 'reviewer',
            assigneeId: 'emp_an',
            status: 'pending',
            priority: 'normal',
            createdAt: t(2),
            decidedAt: null,
            decidedBy: null,
            note: null,
          },
        },
        { seq: 2, at: t(2) },
      ),
    )
    expect(pickApprover('reviewer', csTask, s)).toBe('emp_quan')

    // Dept manager for CS is emp_ngoc
    expect(pickApprover('dept_manager', csTask, s)).toBe('emp_ngoc')

    // Boss owners are emp_giam_doc and emp_pho_giam_doc; tie -> emp_giam_doc, then emp_pho_giam_doc when loaded
    expect(pickApprover('boss', csTask, s)).toBe('emp_giam_doc')
    s = apply(
      s,
      makeEvent(
        'review.requested',
        {
          review: {
            id: 'rev_boss_1',
            taskId: 'task_1',
            level: 'boss',
            assigneeId: 'emp_giam_doc',
            status: 'pending',
            priority: 'normal',
            createdAt: t(3),
            decidedAt: null,
            decidedBy: null,
            note: null,
          },
        },
        { seq: 3, at: t(3) },
      ),
    )
    expect(pickApprover('boss', csTask, s)).toBe('emp_pho_giam_doc')
  })

  it('advances nextInChain on approved, restarts work on changes_requested, and stops on rejected', () => {
    const task = makeSampleTask({ requiredLevel: 'boss' })

    expect(
      nextInChain({ level: 'reviewer', status: 'approved' }, task, DEFAULT_POLICY),
    ).toBe('dept_manager')
    expect(
      nextInChain(
        { level: 'dept_manager', status: 'approved' },
        task,
        DEFAULT_POLICY,
      ),
    ).toBe('boss')
    expect(
      nextInChain({ level: 'boss', status: 'approved' }, task, DEFAULT_POLICY),
    ).toBeNull()

    // changes_requested or rejected stops current chain; after worker reworks, chainFor starts from reviewer again
    expect(
      nextInChain(
        { level: 'dept_manager', status: 'changes_requested' },
        task,
        DEFAULT_POLICY,
      ),
    ).toBeNull()
    expect(
      nextInChain(
        { level: 'reviewer', status: 'rejected' },
        task,
        DEFAULT_POLICY,
      ),
    ).toBeNull()
    expect(chainFor(task.requiredLevel, DEFAULT_POLICY)[0]).toBe('reviewer')
  })
})

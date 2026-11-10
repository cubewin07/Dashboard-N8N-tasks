import { canRetryTask, pickWorker } from '@/domain/assign'
import type { ApprovalLevel, Employee } from '@/domain/config'
import { onHelpTimeout, pickHelper } from '@/domain/help'
import type { DepartmentId, EmployeeId, ReviewId } from '@/domain/primitives'
import { canAsk, isInPerson } from '@/domain/questions'
import { sortQueue } from '@/domain/queue'
import {
  nextInChain,
  pickApprover,
  pickLeadForDepartment,
} from '@/domain/reviews'
import { pileFor } from '@/domain/selectors'
import { planHire } from '@/domain/staffing'
import type { HelpRequest, Question, ReviewItem } from '@/domain/work'
import {
  QUESTIONS_VI,
  REVIEW_NOTES_APPROVE_VI,
  REVIEW_NOTES_CHANGES_VI,
  REVIEW_NOTES_REJECT_VI,
} from '../content/vi'
import { chance, intRange, pick, simId } from '../rng'
import {
  createTaskInBrain,
  emitSimEvent,
  getDeptManagerEmployeeId,
  getManagerEmployeeId,
  getPrimaryOwnerEmployeeId,
  type SimBrainContext,
} from './context'
import { sampleReviewDecision, SIM_ODDS } from './odds'
import {
  computeNextProgress,
  effectiveReviewChain,
  HANDOFF_BY_TASK_TYPE,
  sampleReviewDurationSimMs,
  sampleTaskDurationSimMs,
} from './work'

const TEMP_FIRST_NAMES_VI = [
  'Bình',
  'Châu',
  'Dũng',
  'Đạt',
  'Giang',
  'Hiếu',
  'Hoà',
  'Huy',
  'Kiên',
  'Lâm',
  'Liên',
  'My',
  'Nam',
  'Ngân',
  'Nhung',
  'Phương',
  'Quỳnh',
  'Sơn',
  'Thắng',
  'Thư',
  'Trinh',
  'Trung',
  'Tuấn',
  'Vân',
  'Vinh',
  'Xuân',
] as const

export function hireTempEmployee(
  ctx: SimBrainContext,
  departmentId: DepartmentId,
  createdBy: 'boss' | 'manager',
  specialtiesOverride?: readonly string[],
  causedBy?: string,
  nameOverride?: string,
): Employee {
  const dept = ctx.state.config.departments.find((d) => d.id === departmentId)
  const deptSpecs = ctx.state.config.taskTypes
    .filter((tt) => tt.departmentKey === (dept?.key ?? 'cs'))
    .map((tt) => tt.specialty)
  const uniqueSpecs = Array.from(new Set(deptSpecs))
  const specialties =
    specialtiesOverride && specialtiesOverride.length > 0
      ? [...specialtiesOverride]
      : uniqueSpecs.length > 0
        ? [pick(ctx.rng, uniqueSpecs)]
        : ['customer_chat']

  const tempIndex =
    ctx.state.config.employees.filter((e) => e.kind === 'temp').length + 1
  const baseName = pick(ctx.rng, TEMP_FIRST_NAMES_VI)
  const emp: Employee = {
    id: simId('emp', ctx.rng, ctx.clock.nowMs()),
    name: nameOverride ?? `${baseName} (Tạm ${tempIndex})`,
    departmentId,
    roleKey: 'worker',
    specialties,
    kind: 'temp',
    state: 'active',
    reviewMode: 'always',
    modelTierOverride: null,
    bio: {
      vi: `Nhân sự tăng cường tạm thời hỗ trợ ${dept?.label.vi ?? 'phòng ban'}.`,
      en: `Temporary staff supporting ${dept?.label.en ?? 'department'}.`,
    },
    createdAt: ctx.clock.now(),
    createdBy,
    archivedAt: null,
  }

  emitSimEvent(
    ctx,
    'staff.hired',
    { employee: emp },
    {
      actor:
        createdBy === 'boss'
          ? getPrimaryOwnerEmployeeId(ctx)
          : getManagerEmployeeId(ctx),
      causedBy,
    },
  )
  return emp
}

export function requestInitialReviewOrComplete(
  ctx: SimBrainContext,
  taskId: string,
  level: ApprovalLevel | null,
  actorId: EmployeeId,
  causedBy?: string,
): ReviewItem | null {
  const task = ctx.state.tasks[taskId as keyof typeof ctx.state.tasks]
  if (!task) return null

  if (level === null) {
    emitSimEvent(
      ctx,
      'task.completed',
      { taskId: task.id },
      { actor: actorId, causedBy },
    )
    if (task.typeKey === 'sys.hire_over_cap') {
      hireTempEmployee(ctx, task.departmentId, 'boss', undefined, causedBy)
    }
    return null
  }

  const approverId =
    pickApprover(level, task, ctx.state) ??
    getDeptManagerEmployeeId(ctx, task.departmentId)
  const leadId =
    level === 'reviewer'
      ? (pickLeadForDepartment(task.departmentId, ctx.state) ?? actorId)
      : actorId

  const review: ReviewItem = {
    id: simId('rev', ctx.rng, ctx.clock.nowMs()),
    taskId: task.id,
    level,
    assigneeId: approverId,
    status: 'pending',
    priority: task.priority,
    createdAt: ctx.clock.now(),
    decidedAt: null,
    decidedBy: null,
    note: null,
  }

  emitSimEvent(
    ctx,
    'review.requested',
    { review },
    { actor: leadId, causedBy },
  )

  // Restore courier/lead to idle if they have no active task of their own
  for (const cid of [leadId, task.assigneeId]) {
    if (!cid) continue
    const rt = ctx.state.people[cid]
    if (rt && rt.activity === 'delivering' && rt.taskId === null) {
      emitSimEvent(ctx, 'person.activity', {
        employeeId: cid,
        activity: 'idle',
      })
    }
  }

  return review
}

export function escalateReviewToNextLevel(
  ctx: SimBrainContext,
  fromReviewId: ReviewId,
  taskId: string,
  nextLevel: ApprovalLevel,
  actorId: EmployeeId,
  causedBy?: string,
): ReviewItem | null {
  const task = ctx.state.tasks[taskId as keyof typeof ctx.state.tasks]
  if (!task) return null

  const approverId =
    pickApprover(nextLevel, task, ctx.state) ??
    (nextLevel === 'boss'
      ? getPrimaryOwnerEmployeeId(ctx)
      : getDeptManagerEmployeeId(ctx, task.departmentId))

  const newReview: ReviewItem = {
    id: simId('rev', ctx.rng, ctx.clock.nowMs()),
    taskId: task.id,
    level: nextLevel,
    assigneeId: approverId,
    status: 'pending',
    priority: task.priority,
    createdAt: ctx.clock.now(),
    decidedAt: null,
    decidedBy: null,
    note: null,
  }

  emitSimEvent(
    ctx,
    'review.escalated',
    {
      reviewId: fromReviewId,
      toLevel: nextLevel,
      newReview,
    },
    { actor: actorId, causedBy },
  )

  const actorRt = ctx.state.people[actorId]
  if (actorRt && actorRt.activity === 'delivering' && actorRt.taskId === null) {
    emitSimEvent(ctx, 'person.activity', {
      employeeId: actorId,
      activity: 'idle',
    })
  }

  return newReview
}

export function stepPersonShifts(ctx: SimBrainContext): void {
  const policy = ctx.state.config.policy
  const isLunch = ctx.clock.isLunch(policy)
  const deptMap = new Map(ctx.state.config.departments.map((d) => [d.id, d]))
  const employees = [...ctx.state.config.employees].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )

  for (const emp of employees) {
    if (emp.state !== 'active' || emp.roleKey === 'owner') continue
    const runtime = ctx.state.people[emp.id]
    if (!runtime) continue

    const dept = emp.departmentId ? deptMap.get(emp.departmentId) : null
    const is247 = dept?.hours === '24_7'
    const inWorkHours = is247
      ? true
      : ctx.clock.isWorkHours(dept ?? { hours: 'office' }, policy)

    if (!inWorkHours) {
      if (runtime.activity !== 'off_shift') {
        emitSimEvent(ctx, 'person.activity', {
          employeeId: emp.id,
          activity: 'off_shift',
        })
      }
      continue
    }

    if (!is247 && isLunch) {
      if (runtime.activity !== 'resting') {
        emitSimEvent(ctx, 'person.activity', {
          employeeId: emp.id,
          activity: 'resting',
          locationHint: {
            floorKey: dept?.id ?? 'lobby',
            target: 'other',
          },
        })
      }
      continue
    }

    // Back in open work hours
    if (
      runtime.activity === 'off_shift' ||
      runtime.activity === 'resting' ||
      (runtime.activity === 'delivering' && runtime.taskId === null)
    ) {
      const currentTask = runtime.taskId
        ? ctx.state.tasks[runtime.taskId]
        : null
      const hasInReview = Object.values(ctx.state.reviews).some(
        (r) => r.assigneeId === emp.id && r.status === 'in_review',
      )
      const nextActivity =
        currentTask && currentTask.status === 'in_progress'
          ? 'working'
          : hasInReview
            ? 'reviewing'
            : 'idle'

      emitSimEvent(ctx, 'person.activity', {
        employeeId: emp.id,
        activity: nextActivity,
      })
    }
  }
}

export function stepAssignments(ctx: SimBrainContext): void {
  const policy = ctx.state.config.policy
  const nowIso = ctx.clock.now()
  const isLunch = ctx.clock.isLunch(policy)
  const managerId = getManagerEmployeeId(ctx)

  const departments = [...ctx.state.config.departments].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )

  for (const dept of departments) {
    if (!dept.active) continue
    const is247 = dept.hours === '24_7'
    if (!is247 && (!ctx.clock.isWorkHours(dept, policy) || isLunch)) {
      continue
    }

    const unassigned = Object.values(ctx.state.tasks).filter(
      (t) =>
        t.departmentId === dept.id &&
        t.status === 'queued' &&
        t.assigneeId === null &&
        !t.typeKey.startsWith('sys.'),
    )

    if (unassigned.length === 0) continue
    const sorted = sortQueue(unassigned, nowIso, policy)

    for (const task of sorted) {
      if (task.typeKey.startsWith('sys.')) continue
      const workerId = pickWorker(task.typeKey, dept.id, ctx.state)
      if (!workerId) continue

      const assignerId =
        is247 && task.requestedBy.kind === 'customer'
          ? getDeptManagerEmployeeId(ctx, dept.id)
          : managerId

      emitSimEvent(
        ctx,
        'task.assigned',
        {
          taskId: task.id,
          assigneeId: workerId,
          byId: assignerId,
        },
        { actor: assignerId },
      )

      const assignerRuntime = ctx.state.people[assignerId]
      if (
        assignerRuntime &&
        assignerRuntime.activity === 'delivering' &&
        assignerRuntime.taskId === null
      ) {
        emitSimEvent(ctx, 'person.activity', {
          employeeId: assignerId,
          activity: 'idle',
        })
      }
    }
  }
}

export function stepWorkers(ctx: SimBrainContext, simDtMs: number): void {
  const policy = ctx.state.config.policy
  const isLunch = ctx.clock.isLunch(policy)
  const nowMs = ctx.clock.nowMs()
  const deptMap = new Map(ctx.state.config.departments.map((d) => [d.id, d]))
  const taskTypeMap = new Map(ctx.state.config.taskTypes.map((t) => [t.key, t]))
  const empMap = new Map(ctx.state.config.employees.map((e) => [e.id, e]))

  const tasks = Object.values(ctx.state.tasks).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )

  for (const task of tasks) {
    const dept = deptMap.get(task.departmentId)
    const is247 = dept?.hours === '24_7'
    if (
      dept &&
      !is247 &&
      (!ctx.clock.isWorkHours(dept, policy) || isLunch)
    ) {
      continue
    }

    // System tasks (like sys.hire_over_cap or sys.connect_account) go straight to review
    if (task.typeKey.startsWith('sys.') && task.status === 'queued') {
      const mgrId = getManagerEmployeeId(ctx)
      const chain = effectiveReviewChain(task, undefined, policy)
      const firstLevel = chain[0] ?? 'boss'
      requestInitialReviewOrComplete(ctx, task.id, firstLevel, mgrId)
      continue
    }

    if (task.status === 'queued' && task.assigneeId !== null) {
      const tt = taskTypeMap.get(task.typeKey)
      emitSimEvent(
        ctx,
        'task.started',
        { taskId: task.id },
        { actor: task.assigneeId },
      )
      ctx.taskTimers.set(task.id, {
        startedSimMs: nowMs,
        durationSimMs: sampleTaskDurationSimMs(tt, ctx.rng),
        internalProgress: task.progress,
        lastProgressNotified: Math.floor(task.progress * 10),
        handoffDone: false,
        helpDone: false,
        questionDone: false,
        willFailOnce:
          task.attempts <= 1 && chance(ctx.rng, SIM_ODDS.workFailureChance),
      })
      continue
    }

    if (task.status === 'in_progress' && task.assigneeId !== null) {
      const tt = taskTypeMap.get(task.typeKey)
      let timer = ctx.taskTimers.get(task.id)
      if (!timer) {
        timer = {
          startedSimMs: nowMs,
          durationSimMs: sampleTaskDurationSimMs(tt, ctx.rng),
          internalProgress: task.progress,
          lastProgressNotified: Math.floor(task.progress * 10),
          handoffDone: false,
          helpDone: false,
          questionDone: false,
          willFailOnce: false,
        }
        ctx.taskTimers.set(task.id, timer)
      }

      const nextProgress = computeNextProgress(
        timer.internalProgress,
        simDtMs,
        timer.durationSimMs,
      )
      timer.internalProgress = nextProgress

      const nextBucket = Math.floor(nextProgress * 10)
      if (nextBucket > timer.lastProgressNotified && nextProgress < 1) {
        timer.lastProgressNotified = nextBucket
        emitSimEvent(
          ctx,
          'task.progressed',
          {
            taskId: task.id,
            progress: Math.min(0.95, nextBucket / 10),
          },
          { actor: task.assigneeId },
        )
      }

      // Mid-task interactions around 35%-85% progress
      if (nextProgress >= 0.35 && nextProgress < 0.85) {
        // 1. Optional worker question
        if (!timer.questionDone && canAsk(task.id, ctx.state, policy)) {
          timer.questionDone = true
          if (chance(ctx.rng, SIM_ODDS.questionChance)) {
            const targetId = getDeptManagerEmployeeId(ctx, task.departmentId)
            const qa = pick(ctx.rng, QUESTIONS_VI)
            const inPerson = isInPerson(targetId, ctx.state, policy)
            const q: Question = {
              id: simId('q', ctx.rng, nowMs),
              taskId: task.id,
              fromId: task.assigneeId,
              toId: targetId,
              text: qa.question,
              status: 'open',
              inPerson,
              createdAt: ctx.clock.now(),
              answeredAt: null,
            }
            emitSimEvent(
              ctx,
              'question.asked',
              { question: q },
              { actor: task.assigneeId },
            )
            ctx.questionTimers.set(q.id, {
              askedSimMs: nowMs,
              answerDurationSimMs:
                intRange(
                  ctx.rng,
                  SIM_ODDS.questionAnswerMinutes[0],
                  SIM_ODDS.questionAnswerMinutes[1],
                ) * 60_000,
              isBossTarget: false,
            })
            continue
          }
        }

        // 2. Optional help request
        if (!timer.helpDone && tt && tt.needsHelpFrom.length > 0) {
          timer.helpDone = true
          if (chance(ctx.rng, SIM_ODDS.helpRequestChance)) {
            const neededSpec = pick(ctx.rng, tt.needsHelpFrom)
            const helperId = pickHelper(neededSpec, ctx.state, [
              task.assigneeId,
            ])
            const timeoutMs = policy.help.timeoutMinutes * 60_000
            const help: HelpRequest = {
              id: simId('help', ctx.rng, nowMs),
              taskId: task.id,
              fromId: task.assigneeId,
              specialty: neededSpec,
              toId: helperId,
              round: 1,
              status: 'open',
              createdAt: ctx.clock.now(),
              timeoutAt: new Date(nowMs + timeoutMs).toISOString(),
            }
            emitSimEvent(
              ctx,
              'help.requested',
              { help },
              { actor: task.assigneeId },
            )
            ctx.helpTimers.set(help.id, {
              requestedSimMs: nowMs,
              acceptedSimMs: null,
              durationSimMs:
                intRange(
                  ctx.rng,
                  SIM_ODDS.helpDurationMinutes[0],
                  SIM_ODDS.helpDurationMinutes[1],
                ) * 60_000,
            })
            continue
          }
        }

        // 3. Optional cross-department handoff
        const handoffSpec = HANDOFF_BY_TASK_TYPE[task.typeKey]
        if (!timer.handoffDone && handoffSpec && !task.parentTaskId) {
          timer.handoffDone = true
          if (chance(ctx.rng, SIM_ODDS.handoffChance)) {
            const childTask = createTaskInBrain(ctx, handoffSpec.childTypeKey, {
              requestedByKind: 'employee',
              requestedById: task.assigneeId,
              channel: 'internal',
              departmentId: handoffSpec.targetDepartmentId,
              platformKey: task.platformKey,
              parentTaskId: task.id,
              priority: task.priority,
              crossDepartment: true,
              actor: task.assigneeId,
            })
            const targetMgrId = getDeptManagerEmployeeId(
              ctx,
              handoffSpec.targetDepartmentId,
            )
            emitSimEvent(
              ctx,
              'task.handed_off',
              {
                taskId: task.id,
                fromId: task.assigneeId,
                toId: targetMgrId,
                newTaskId: childTask.id,
              },
              { actor: task.assigneeId },
            )
            emitSimEvent(ctx, 'person.activity', {
              employeeId: task.assigneeId,
              activity: 'working',
            })
          }
        }
      }

      if (nextProgress >= 1) {
        if (timer.willFailOnce) {
          timer.willFailOnce = false
          if (canRetryTask(task, policy)) {
            emitSimEvent(
              ctx,
              'task.progressed',
              { taskId: task.id, progress: 0.2 },
              { actor: task.assigneeId },
            )
            timer.internalProgress = 0.2
            timer.lastProgressNotified = 2
            continue
          } else {
            emitSimEvent(
              ctx,
              'task.failed',
              {
                taskId: task.id,
                reason:
                  'Không thể đồng bộ dữ liệu lên nền tảng sau số lần thử lại tối đa.',
              },
              { actor: task.assigneeId },
            )
            ctx.taskTimers.delete(task.id)
            continue
          }
        }

        // Work finished -> start review chain or complete
        emitSimEvent(
          ctx,
          'task.progressed',
          { taskId: task.id, progress: 1 },
          { actor: task.assigneeId },
        )
        const worker = empMap.get(task.assigneeId)
        const chain = effectiveReviewChain(task, worker, policy)
        const firstLevel = chain[0] ?? null
        requestInitialReviewOrComplete(
          ctx,
          task.id,
          firstLevel,
          task.assigneeId,
        )
      }
    }
  }
}

export function stepHelps(ctx: SimBrainContext): void {
  const policy = ctx.state.config.policy
  const nowMs = ctx.clock.nowMs()
  const timeoutSimMs = policy.help.timeoutMinutes * 60_000

  const helps = Object.values(ctx.state.help).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )

  for (const h of helps) {
    let timer = ctx.helpTimers.get(h.id)
    if (!timer) {
      timer = {
        requestedSimMs: Date.parse(h.createdAt),
        acceptedSimMs: h.status === 'accepted' ? nowMs : null,
        durationSimMs: 6 * 60_000,
      }
      ctx.helpTimers.set(h.id, timer)
    }

    if (h.status === 'open') {
      const elapsed = nowMs - timer.requestedSimMs
      if (elapsed >= timeoutSimMs) {
        const task = ctx.state.tasks[h.taskId]
        const action = onHelpTimeout(h, policy)
        if (action === 'retry' && task) {
          const nextHelper =
            pickHelper(h.specialty, ctx.state, [
              h.fromId,
              ...(h.toId ? [h.toId] : []),
            ]) ?? getDeptManagerEmployeeId(ctx, task.departmentId)
          emitSimEvent(
            ctx,
            'help.timed_out',
            {
              helpId: h.id,
              toId: nextHelper,
            },
            { actor: h.fromId },
          )
          timer.requestedSimMs = nowMs
        } else if (task) {
          const mgrId = getDeptManagerEmployeeId(ctx, task.departmentId)
          emitSimEvent(
            ctx,
            'help.escalated',
            { helpId: h.id, toId: mgrId },
            { actor: mgrId },
          )
        }
        continue
      }

      // Accept after 1 sim-minute if a helper is assigned
      if (h.toId && elapsed >= 60_000) {
        const helperRuntime = ctx.state.people[h.toId]
        if (
          helperRuntime &&
          helperRuntime.activity !== 'off_shift' &&
          helperRuntime.activity !== 'helping'
        ) {
          emitSimEvent(
            ctx,
            'help.accepted',
            { helpId: h.id, byId: h.toId },
            { actor: h.toId },
          )
          timer.acceptedSimMs = nowMs
        }
      }
      continue
    }

    if (h.status === 'timed_out' && h.toId) {
      const helperRuntime = ctx.state.people[h.toId]
      if (
        helperRuntime &&
        helperRuntime.activity !== 'off_shift' &&
        helperRuntime.activity !== 'helping' &&
        nowMs - timer.requestedSimMs >= 60_000
      ) {
        emitSimEvent(
          ctx,
          'help.accepted',
          { helpId: h.id, byId: h.toId },
          { actor: h.toId },
        )
        timer.acceptedSimMs = nowMs
      }
      continue
    }

    if (h.status === 'accepted' && timer.acceptedSimMs !== null && h.toId) {
      if (nowMs - timer.acceptedSimMs >= timer.durationSimMs) {
        emitSimEvent(
          ctx,
          'help.answered',
          { helpId: h.id, byId: h.toId },
          { actor: h.toId },
        )
      }
    }
  }
}

export function stepQuestions(ctx: SimBrainContext): void {
  const nowMs = ctx.clock.nowMs()
  const empMap = new Map(ctx.state.config.employees.map((e) => [e.id, e]))

  const questions = Object.values(ctx.state.questions).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )

  for (const q of questions) {
    if (q.status !== 'open') continue
    const targetEmp = empMap.get(q.toId)
    const isOwner = targetEmp?.roleKey === 'owner'

    let timer = ctx.questionTimers.get(q.id)
    if (!timer) {
      timer = {
        askedSimMs: Date.parse(q.createdAt),
        answerDurationSimMs: 3 * 60_000,
        isBossTarget: isOwner,
      }
      ctx.questionTimers.set(q.id, timer)
    }

    if (isOwner) {
      if (
        !ctx.autoApproveBoss ||
        nowMs - timer.askedSimMs < SIM_ODDS.autoApproveBossDelaySimMs
      ) {
        continue
      }
    } else if (nowMs - timer.askedSimMs < timer.answerDurationSimMs) {
      continue
    }

    const matchedPair = QUESTIONS_VI.find((p) => p.question === q.text)
    const answerText =
      matchedPair?.answer ??
      'Giao cho phòng Marketing xử lý và báo cáo lại trước cuối ngày nhé.'

    emitSimEvent(
      ctx,
      'question.answered',
      {
        questionId: q.id,
        answer: answerText,
      },
      { actor: q.toId },
    )
  }
}

export function stepReviews(ctx: SimBrainContext): void {
  const policy = ctx.state.config.policy
  const nowMs = ctx.clock.nowMs()
  const isLunch = ctx.clock.isLunch(policy)
  const deptMap = new Map(ctx.state.config.departments.map((d) => [d.id, d]))

  const employees = [...ctx.state.config.employees].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )

  for (const emp of employees) {
    if (emp.state !== 'active') continue
    if (
      emp.roleKey !== 'reviewer' &&
      emp.roleKey !== 'dept_manager' &&
      emp.roleKey !== 'owner'
    ) {
      continue
    }

    const isOwner = emp.roleKey === 'owner'
    if (isOwner && !ctx.autoApproveBoss) {
      continue
    }

    const dept = emp.departmentId ? deptMap.get(emp.departmentId) : null
    if (
      dept &&
      dept.hours === 'office' &&
      (!ctx.clock.isWorkHours(dept, policy) || isLunch)
    ) {
      continue
    }

    const empReviews = Object.values(ctx.state.reviews)
      .filter((r) => r.assigneeId === emp.id)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

    const activeReview = empReviews.find((r) => r.status === 'in_review')
    if (activeReview) {
      let rTimer = ctx.reviewTimers.get(activeReview.id)
      if (!rTimer) {
        rTimer = {
          startedSimMs: Date.parse(activeReview.createdAt),
          durationSimMs: sampleReviewDurationSimMs(
            activeReview.level,
            ctx.rng,
          ),
        }
        ctx.reviewTimers.set(activeReview.id, rTimer)
      }

      if (nowMs - rTimer.startedSimMs < rTimer.durationSimMs) {
        continue
      }

      const task = ctx.state.tasks[activeReview.taskId]
      const decision = sampleReviewDecision(
        ctx.rng,
        activeReview.level,
        task?.attempts ?? 1,
      )
      const note =
        decision === 'approved'
          ? pick(ctx.rng, REVIEW_NOTES_APPROVE_VI)
          : decision === 'changes_requested'
            ? pick(ctx.rng, REVIEW_NOTES_CHANGES_VI)
            : pick(ctx.rng, REVIEW_NOTES_REJECT_VI)

      decideReviewInBrain(ctx, activeReview, decision, note, emp.id)
      continue
    }

    // Start next pending review from pile
    const pile = pileFor(ctx.state, emp.id)
    const nextPending = pile.find((r) => r.status === 'pending')
    if (!nextPending) continue

    if (
      isOwner &&
      nowMs - Date.parse(nextPending.createdAt) <
        SIM_ODDS.autoApproveBossDelaySimMs
    ) {
      continue
    }

    emitSimEvent(
      ctx,
      'review.started',
      {
        reviewId: nextPending.id,
      },
      { actor: emp.id },
    )
    ctx.reviewTimers.set(nextPending.id, {
      startedSimMs: nowMs,
      durationSimMs: sampleReviewDurationSimMs(nextPending.level, ctx.rng),
    })
  }
}

export function decideReviewInBrain(
  ctx: SimBrainContext,
  review: ReviewItem,
  decision: 'approved' | 'changes_requested' | 'rejected',
  note: string | undefined,
  byId: EmployeeId,
  causedBy?: string,
): void {
  emitSimEvent(
    ctx,
    'review.decided',
    {
      reviewId: review.id,
      decision,
      ...(note ? { note } : {}),
    },
    { actor: byId, causedBy },
  )

  const task = ctx.state.tasks[review.taskId]
  if (!task) return

  if (decision === 'approved') {
    const nextLevel = nextInChain(review, task, ctx.state.config.policy)
    if (nextLevel === null) {
      requestInitialReviewOrComplete(ctx, task.id, null, byId, causedBy)
    } else {
      escalateReviewToNextLevel(
        ctx,
        review.id,
        task.id,
        nextLevel,
        byId,
        causedBy,
      )
    }
  } else if (decision === 'changes_requested') {
    const timer = ctx.taskTimers.get(task.id)
    if (timer) {
      timer.internalProgress = 0.6
      timer.lastProgressNotified = 6
    }
  } else if (decision === 'rejected') {
    ctx.taskTimers.delete(task.id)
  }
}

export function stepStaffing(ctx: SimBrainContext): void {
  const nowMs = ctx.clock.nowMs()
  const nowIso = ctx.clock.now()
  const managerId = getManagerEmployeeId(ctx)

  for (const dept of ctx.state.config.departments) {
    if (!dept.active) continue
    const queuedCount = Object.values(ctx.state.tasks).filter(
      (t) => t.departmentId === dept.id && t.status === 'queued',
    ).length

    if (queuedCount > SIM_ODDS.queueOverloadThreshold) {
      const since = ctx.deptOverloadSinceSimMs.get(dept.id)
      if (since === undefined) {
        ctx.deptOverloadSinceSimMs.set(dept.id, nowMs)
      } else if (nowMs - since >= SIM_ODDS.queueOverloadWindowSimMs) {
        ctx.deptOverloadSinceSimMs.set(dept.id, nowMs)
        const plan = planHire({ requestedBy: 'manager' }, ctx.state, nowIso)
        if (plan.kind === 'hire') {
          hireTempEmployee(ctx, dept.id, 'manager')
        } else if (plan.kind === 'hire_after_archive') {
          emitSimEvent(
            ctx,
            'staff.archived',
            { employeeId: plan.archiveId, reason: 'cap' },
            { actor: managerId },
          )
          hireTempEmployee(ctx, dept.id, 'manager')
        } else if (plan.kind === 'needs_boss') {
          const existingOverCap = Object.values(ctx.state.tasks).some(
            (t) =>
              t.typeKey === 'sys.hire_over_cap' &&
              t.departmentId === dept.id &&
              t.status !== 'done' &&
              t.status !== 'cancelled',
          )
          if (!existingOverCap) {
            createTaskInBrain(ctx, 'sys.hire_over_cap', {
              requestedByKind: 'manager',
              channel: 'internal',
              departmentId: dept.id,
              priority: 'high',
              actor: managerId,
            })
          }
        }
      }
    } else {
      ctx.deptOverloadSinceSimMs.delete(dept.id)
    }
  }
}

import type { CarriedItem, OrgConfig } from './config'
import { applyConfigChange } from './configChange'

export { applyConfigChange }
import { EVENT_TYPES, type EventType, type OfficeEvent } from './events'
import { isIdOf } from './ids'
import type { EmployeeId, Iso, MessageId, ReviewId, TaskId } from './primitives'
import { crossedHour, pruneFinished } from './retention'
import { pickApprover } from './reviews'
import type { IntakeMessage, OfficeState, PersonRuntime, ReviewItem, Task } from './work'

const MAX_LOG_SIZE = 500
const KNOWN_EVENT_TYPES = new Set<string>(EVENT_TYPES)

function makeIdlePerson(employeeId: EmployeeId, now: Iso): PersonRuntime {
  return {
    employeeId,
    activity: 'idle',
    taskId: null,
    carrying: null,
    platformKey: null,
    idleSince: now,
    lastActiveAt: now,
    location: null,
  }
}

export function initialState(config: OrgConfig, now: Iso): OfficeState {
  const people: Record<EmployeeId, PersonRuntime> = {}
  for (const emp of config.employees) {
    if (emp.state === 'active') {
      people[emp.id] = makeIdlePerson(emp.id, now)
    }
  }
  return {
    schema: 1,
    now,
    config,
    people,
    tasks: {},
    reviews: {},
    questions: {},
    help: {},
    messages: {},
    log: [],
    seq: 0,
    lastHeartbeat: null,
  }
}

function appendLog(log: OfficeEvent[], event: OfficeEvent): OfficeEvent[] {
  const next = [...log, event]
  return next.length > MAX_LOG_SIZE ? next.slice(next.length - MAX_LOG_SIZE) : next
}

function resolveCarries(config: OrgConfig, typeKey: string): CarriedItem {
  const found = config.taskTypes.find((tt) => tt.key === typeKey)
  return found?.carries ?? 'document'
}

function findOtherActiveTask(
  tasks: Record<TaskId, Task>,
  employeeId: EmployeeId,
  excludeTaskId: TaskId,
): Task | null {
  for (const t of Object.values(tasks)) {
    if (t.id === excludeTaskId || t.assigneeId !== employeeId) continue
    if (
      t.status === 'in_progress' ||
      t.status === 'waiting_help' ||
      t.status === 'waiting_answer' ||
      t.status === 'blocked'
    ) {
      // A task in review is waiting on someone else; the worker is not on it.
      return t
    }
  }
  return null
}

function releasePersonFromTask(
  people: Record<EmployeeId, PersonRuntime>,
  tasks: Record<TaskId, Task>,
  config: OrgConfig,
  employeeId: EmployeeId | null,
  excludeTaskId: TaskId,
  at: Iso,
): Record<EmployeeId, PersonRuntime> {
  if (!employeeId) return people
  const current = people[employeeId]
  if (!current) return people

  const other = findOtherActiveTask(tasks, employeeId, excludeTaskId)
  if (other) {
    return {
      ...people,
      [employeeId]: {
        ...current,
        activity: other.status === 'waiting_answer' ? 'asking' : 'working',
        taskId: other.id,
        carrying: resolveCarries(config, other.typeKey),
        platformKey: other.platformKey,
        idleSince: null,
        lastActiveAt: at,
      },
    }
  }

  return {
    ...people,
    [employeeId]: {
      ...current,
      activity: 'idle',
      taskId: null,
      carrying: null,
      platformKey: null,
      idleSince: at,
      lastActiveAt: at,
    },
  }
}

function markCourierDelivering(
  people: Record<EmployeeId, PersonRuntime>,
  courierId: string | null | undefined,
  targetId: string | null | undefined,
  at: Iso,
): Record<EmployeeId, PersonRuntime> {
  if (!courierId || courierId === targetId) return people
  const person = people[courierId as EmployeeId]
  if (!person) return people
  return {
    ...people,
    [person.employeeId]: {
      ...person,
      activity: 'delivering',
      carrying: 'document',
      idleSince: null,
      lastActiveAt: at,
    },
  }
}

function skipWarn(state: OfficeState, event: OfficeEvent, reason: string): OfficeState {
  console.warn(`[reducer] Skipping event ${event.id} (${String(event.type)}): ${reason}`)
  return state
}

/**
 * Swap in a whole new config snapshot: active employees keep their runtime (or start idle),
 * archived or removed ones leave `people`. Used by `config.changed` and by the office store
 * when the ConfigSource pushes a newer config (P09: a change made in another browser).
 */
export function withConfig(state: OfficeState, config: OrgConfig, now: Iso): OfficeState {
  const people: Record<EmployeeId, PersonRuntime> = {}
  for (const emp of config.employees) {
    if (emp.state === 'active') {
      people[emp.id] = state.people[emp.id] ?? makeIdlePerson(emp.id, now)
    }
  }
  return { ...state, config, people }
}

export function apply(state: OfficeState, event: OfficeEvent): OfficeState {
  if (event.seq <= state.seq) {
    return state
  }
  if (!KNOWN_EVENT_TYPES.has(event.type as EventType)) {
    return skipWarn(state, event, `unknown event type "${String(event.type)}"`)
  }

  switch (event.type) {
    case 'intake.received': {
      const p = event.payload as OfficeEvent<'intake.received'>['payload']
      const existing = state.messages[p.messageId]
      const msg: IntakeMessage = {
        id: p.messageId,
        channel: p.channel,
        modality: p.modality,
        fromUserId: p.fromUserId,
        text: p.text,
        at: event.at,
        taskIds: existing ? existing.taskIds : [],
      }
      return {
        ...state,
        now: event.at,
        seq: event.seq,
        messages: {
          ...state.messages,
          [p.messageId]: msg,
        },
        log: appendLog(state.log, event),
      }
    }

    case 'task.created': {
      const p = event.payload as OfficeEvent<'task.created'>['payload']
      const { task } = p
      const deptExists = state.config.departments.some((d) => d.id === task.departmentId)
      if (!deptExists) {
        return skipWarn(state, event, `unknown departmentId "${task.departmentId}"`)
      }
      if (task.assigneeId !== null && !state.people[task.assigneeId]) {
        return skipWarn(state, event, `unknown assigneeId "${task.assigneeId}"`)
      }

      let nextMessages = state.messages
      if (event.causedBy && isIdOf(event.causedBy, 'msg')) {
        const msg = state.messages[event.causedBy as MessageId]
        if (msg && !msg.taskIds.includes(task.id)) {
          nextMessages = {
            ...state.messages,
            [msg.id]: {
              ...msg,
              taskIds: [...msg.taskIds, task.id],
            },
          }
        }
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: {
          ...state.tasks,
          [task.id]: task,
        },
        messages: nextMessages,
        log: appendLog(state.log, event),
      }
    }

    case 'task.assigned': {
      const p = event.payload as OfficeEvent<'task.assigned'>['payload']
      const task = state.tasks[p.taskId]
      if (!task) {
        return skipWarn(state, event, `unknown taskId "${p.taskId}"`)
      }
      const assignee = state.people[p.assigneeId]
      if (!assignee) {
        return skipWarn(state, event, `unknown assigneeId "${p.assigneeId}"`)
      }

      const updatedTask: Task = {
        ...task,
        assigneeId: p.assigneeId,
      }
      const nextPeople = markCourierDelivering(
        state.people,
        p.byId,
        p.assigneeId,
        event.at,
      )

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: {
          ...state.tasks,
          [task.id]: updatedTask,
        },
        people: nextPeople,
        log: appendLog(state.log, event),
      }
    }

    case 'task.started': {
      const p = event.payload as OfficeEvent<'task.started'>['payload']
      const task = state.tasks[p.taskId]
      if (!task) {
        return skipWarn(state, event, `unknown taskId "${p.taskId}"`)
      }
      if (!task.assigneeId || !state.people[task.assigneeId]) {
        return skipWarn(
          state,
          event,
          `task "${p.taskId}" has no active assignee (${String(task.assigneeId)})`,
        )
      }

      const assignee = state.people[task.assigneeId]!
      const updatedTask: Task = {
        ...task,
        status: 'in_progress',
        startedAt: task.startedAt ?? event.at,
      }
      const updatedPerson: PersonRuntime = {
        ...assignee,
        activity: 'working',
        taskId: task.id,
        carrying: resolveCarries(state.config, task.typeKey),
        platformKey: task.platformKey,
        idleSince: null,
        lastActiveAt: event.at,
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: {
          ...state.tasks,
          [task.id]: updatedTask,
        },
        people: {
          ...state.people,
          [assignee.employeeId]: updatedPerson,
        },
        log: appendLog(state.log, event),
      }
    }

    case 'task.progressed': {
      const p = event.payload as OfficeEvent<'task.progressed'>['payload']
      const task = state.tasks[p.taskId]
      if (!task) {
        return skipWarn(state, event, `unknown taskId "${p.taskId}"`)
      }
      const updatedTask: Task = {
        ...task,
        progress: p.progress,
      }
      let nextPeople = state.people
      if (task.assigneeId && state.people[task.assigneeId]) {
        const person = state.people[task.assigneeId]!
        nextPeople = {
          ...state.people,
          [person.employeeId]: {
            ...person,
            lastActiveAt: event.at,
          },
        }
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: {
          ...state.tasks,
          [task.id]: updatedTask,
        },
        people: nextPeople,
        log: appendLog(state.log, event),
      }
    }

    case 'task.handed_off': {
      const p = event.payload as OfficeEvent<'task.handed_off'>['payload']
      const task = state.tasks[p.taskId]
      if (!task) {
        return skipWarn(state, event, `unknown taskId "${p.taskId}"`)
      }
      const fromPerson = state.people[p.fromId]
      const toPerson = state.people[p.toId]
      if (!fromPerson || !toPerson) {
        return skipWarn(
          state,
          event,
          `unknown fromId "${p.fromId}" or toId "${p.toId}"`,
        )
      }

      let nextTasks = state.tasks
      let nextPeople = state.people

      if (p.newTaskId === undefined) {
        nextTasks = {
          ...state.tasks,
          [task.id]: {
            ...task,
            assigneeId: p.toId,
          },
        }
        if (fromPerson.taskId === task.id) {
          nextPeople = {
            ...nextPeople,
            [p.fromId]: {
              ...fromPerson,
              taskId: null,
            },
          }
        }
      }

      nextPeople = markCourierDelivering(nextPeople, p.fromId, p.toId, event.at)

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: nextTasks,
        people: nextPeople,
        log: appendLog(state.log, event),
      }
    }

    case 'task.reprioritised': {
      const p = event.payload as OfficeEvent<'task.reprioritised'>['payload']
      const task = state.tasks[p.taskId]
      if (!task) {
        return skipWarn(state, event, `unknown taskId "${p.taskId}"`)
      }
      const updatedTask: Task = {
        ...task,
        priority: p.priority,
      }
      let nextReviews = state.reviews
      for (const rev of Object.values(state.reviews)) {
        if (
          rev.taskId === task.id &&
          (rev.status === 'pending' || rev.status === 'in_review')
        ) {
          nextReviews = {
            ...nextReviews,
            [rev.id]: {
              ...rev,
              priority: p.priority,
            },
          }
        }
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: {
          ...state.tasks,
          [task.id]: updatedTask,
        },
        reviews: nextReviews,
        log: appendLog(state.log, event),
      }
    }

    case 'task.blocked': {
      const p = event.payload as OfficeEvent<'task.blocked'>['payload']
      const task = state.tasks[p.taskId]
      if (!task) {
        return skipWarn(state, event, `unknown taskId "${p.taskId}"`)
      }
      const updatedTask: Task = {
        ...task,
        status: 'blocked',
        detail: p.reason,
      }
      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: {
          ...state.tasks,
          [task.id]: updatedTask,
        },
        log: appendLog(state.log, event),
      }
    }

    case 'task.completed': {
      const p = event.payload as OfficeEvent<'task.completed'>['payload']
      const task = state.tasks[p.taskId]
      if (!task) {
        return skipWarn(state, event, `unknown taskId "${p.taskId}"`)
      }
      const updatedTask: Task = {
        ...task,
        status: 'done',
        progress: 1,
        finishedAt: event.at,
      }
      const nextTasks = {
        ...state.tasks,
        [task.id]: updatedTask,
      }
      const nextPeople = releasePersonFromTask(
        state.people,
        nextTasks,
        state.config,
        task.assigneeId,
        task.id,
        event.at,
      )
      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: nextTasks,
        people: nextPeople,
        log: appendLog(state.log, event),
      }
    }

    case 'task.cancelled':
    case 'task.failed': {
      // A cancelled or failed task ends the same way: its open reviews, questions and
      // help requests close, and everyone working on it is freed.
      const p = event.payload as OfficeEvent<'task.cancelled' | 'task.failed'>['payload']
      const task = state.tasks[p.taskId]
      if (!task) {
        return skipWarn(state, event, `unknown taskId "${p.taskId}"`)
      }
      const updatedTask: Task = {
        ...task,
        status: event.type === 'task.failed' ? 'failed' : 'cancelled',
        detail: p.reason,
        finishedAt: event.at,
      }
      const nextTasks = {
        ...state.tasks,
        [task.id]: updatedTask,
      }
      let nextReviews = state.reviews
      for (const rev of Object.values(state.reviews)) {
        if (
          rev.taskId === task.id &&
          (rev.status === 'pending' || rev.status === 'in_review')
        ) {
          nextReviews = {
            ...nextReviews,
            [rev.id]: {
              ...rev,
              status: 'rejected',
              decidedAt: event.at,
              note: p.reason,
            },
          }
        }
      }
      let nextQuestions = state.questions
      for (const q of Object.values(state.questions)) {
        if (q.taskId === task.id && q.status === 'open') {
          nextQuestions = {
            ...nextQuestions,
            [q.id]: {
              ...q,
              status: 'expired',
              answeredAt: event.at,
            },
          }
        }
      }
      let nextPeople = releasePersonFromTask(
        state.people,
        nextTasks,
        state.config,
        task.assigneeId,
        task.id,
        event.at,
      )

      // Nobody should stay "reviewing" a task that no longer exists.
      for (const rev of Object.values(state.reviews)) {
        if (rev.taskId !== task.id || rev.status !== 'in_review') continue
        const approver = nextPeople[rev.assigneeId]
        if (!approver || approver.activity !== 'reviewing') continue
        const hasOtherInReview = Object.values(nextReviews).some(
          (r) =>
            r.id !== rev.id &&
            r.assigneeId === rev.assigneeId &&
            r.status === 'in_review',
        )
        if (hasOtherInReview) continue
        nextPeople = {
          ...nextPeople,
          [approver.employeeId]: {
            ...approver,
            activity: 'idle',
            taskId: null,
            carrying: null,
            platformKey: null,
            idleSince: event.at,
            lastActiveAt: event.at,
          },
        }
      }

      // Close help requests for the task and free a helper who was mid-help.
      let nextHelp = state.help
      for (const h of Object.values(state.help)) {
        if (h.taskId !== task.id) continue
        if (h.status === 'answered' || h.status === 'escalated') continue
        nextHelp = { ...nextHelp, [h.id]: { ...h, status: 'answered' } }
        const helper = h.toId ? nextPeople[h.toId] : undefined
        if (h.status === 'accepted' && helper && helper.activity === 'helping') {
          nextPeople = releasePersonFromTask(
            nextPeople,
            nextTasks,
            state.config,
            helper.employeeId,
            task.id,
            event.at,
          )
        }
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: nextTasks,
        reviews: nextReviews,
        questions: nextQuestions,
        help: nextHelp,
        people: nextPeople,
        log: appendLog(state.log, event),
      }
    }

    case 'review.requested': {
      const p = event.payload as OfficeEvent<'review.requested'>['payload']
      const { review } = p
      const task = state.tasks[review.taskId]
      if (!task) {
        return skipWarn(state, event, `unknown taskId "${review.taskId}"`)
      }
      const approver = state.people[review.assigneeId]
      if (!approver) {
        return skipWarn(state, event, `unknown approver "${review.assigneeId}"`)
      }

      const updatedTask: Task = {
        ...task,
        status: 'in_review',
      }
      const courierId =
        task.assigneeId && task.assigneeId !== review.assigneeId
          ? task.assigneeId
          : event.actor.kind === 'employee'
            ? event.actor.id
            : null
      const nextPeople = markCourierDelivering(
        state.people,
        courierId,
        review.assigneeId,
        event.at,
      )

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: {
          ...state.tasks,
          [task.id]: updatedTask,
        },
        reviews: {
          ...state.reviews,
          [review.id]: review,
        },
        people: nextPeople,
        log: appendLog(state.log, event),
      }
    }

    case 'review.started': {
      const p = event.payload as OfficeEvent<'review.started'>['payload']
      const review = state.reviews[p.reviewId]
      if (!review) {
        return skipWarn(state, event, `unknown reviewId "${p.reviewId}"`)
      }
      const approver = state.people[review.assigneeId]
      if (!approver) {
        return skipWarn(state, event, `unknown approver "${review.assigneeId}"`)
      }

      const updatedReview: ReviewItem = {
        ...review,
        status: 'in_review',
      }
      const updatedApprover: PersonRuntime = {
        ...approver,
        activity: 'reviewing',
        taskId: review.taskId,
        carrying: 'document',
        idleSince: null,
        lastActiveAt: event.at,
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        reviews: {
          ...state.reviews,
          [review.id]: updatedReview,
        },
        people: {
          ...state.people,
          [approver.employeeId]: updatedApprover,
        },
        log: appendLog(state.log, event),
      }
    }

    case 'review.decided': {
      const p = event.payload as OfficeEvent<'review.decided'>['payload']
      const review = state.reviews[p.reviewId]
      if (!review) {
        return skipWarn(state, event, `unknown reviewId "${p.reviewId}"`)
      }
      if (review.status !== 'pending' && review.status !== 'in_review') {
        // A late or duplicate decision must not reopen a settled task.
        return skipWarn(state, event, `review "${review.id}" already ${review.status}`)
      }
      const task = state.tasks[review.taskId]
      if (!task) {
        return skipWarn(state, event, `unknown taskId "${review.taskId}"`)
      }

      const updatedReview: ReviewItem = {
        ...review,
        status: p.decision,
        decidedAt: event.at,
        decidedBy: event.actor.id,
        note: p.note ?? null,
      }
      const nextReviews: Record<ReviewId, ReviewItem> = {
        ...state.reviews,
        [review.id]: updatedReview,
      }

      let nextPeople = state.people
      const approver = state.people[review.assigneeId]
      if (approver && approver.activity === 'reviewing') {
        const hasOtherInReview = Object.values(nextReviews).some(
          (r) =>
            r.id !== review.id &&
            r.assigneeId === review.assigneeId &&
            r.status === 'in_review',
        )
        if (!hasOtherInReview) {
          nextPeople = {
            ...nextPeople,
            [approver.employeeId]: {
              ...approver,
              activity: 'idle',
              taskId: null,
              carrying: null,
              platformKey: null,
              idleSince: event.at,
              lastActiveAt: event.at,
            },
          }
        }
      }

      let updatedTask = task
      if (p.decision === 'changes_requested') {
        const workerBusyWithOther =
          task.assigneeId !== null &&
          Object.values(state.tasks).some(
            (t) =>
              t.id !== task.id &&
              t.assigneeId === task.assigneeId &&
              (t.status === 'in_progress' ||
                t.status === 'waiting_help' ||
                t.status === 'waiting_answer'),
          )
        updatedTask = {
          ...task,
          status: workerBusyWithOther ? 'queued' : 'in_progress',
          progress: 0.6,
          attempts: task.attempts + 1,
        }
        if (
          !workerBusyWithOther &&
          task.assigneeId &&
          nextPeople[task.assigneeId]
        ) {
          const worker = nextPeople[task.assigneeId]!
          nextPeople = {
            ...nextPeople,
            [worker.employeeId]: {
              ...worker,
              activity: 'working',
              taskId: task.id,
              carrying: resolveCarries(state.config, task.typeKey),
              platformKey: task.platformKey,
              idleSince: null,
              lastActiveAt: event.at,
            },
          }
        }
      } else if (p.decision === 'rejected') {
        updatedTask = {
          ...task,
          status: 'cancelled',
          finishedAt: event.at,
          detail: p.note ?? task.detail,
        }
        const tempTasks = {
          ...state.tasks,
          [task.id]: updatedTask,
        }
        nextPeople = releasePersonFromTask(
          nextPeople,
          tempTasks,
          state.config,
          task.assigneeId,
          task.id,
          event.at,
        )
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: {
          ...state.tasks,
          [task.id]: updatedTask,
        },
        reviews: nextReviews,
        people: nextPeople,
        log: appendLog(state.log, event),
      }
    }

    case 'review.escalated': {
      const p = event.payload as OfficeEvent<'review.escalated'>['payload']
      const prevReview = state.reviews[p.reviewId]
      if (!prevReview) {
        return skipWarn(state, event, `unknown reviewId "${p.reviewId}"`)
      }
      const nextApprover = state.people[p.newReview.assigneeId]
      if (!nextApprover) {
        return skipWarn(
          state,
          event,
          `unknown newReview.assigneeId "${p.newReview.assigneeId}"`,
        )
      }
      const task = state.tasks[p.newReview.taskId]
      if (!task) {
        return skipWarn(state, event, `unknown taskId "${p.newReview.taskId}"`)
      }

      const updatedPrevReview: ReviewItem =
        prevReview.status === 'pending' || prevReview.status === 'in_review'
          ? {
              ...prevReview,
              status: 'approved',
              decidedAt: prevReview.decidedAt ?? event.at,
            }
          : prevReview

      const courierId =
        event.actor.kind === 'employee' && event.actor.id
          ? event.actor.id
          : prevReview.assigneeId
      const nextPeople = markCourierDelivering(
        state.people,
        courierId,
        p.newReview.assigneeId,
        event.at,
      )

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: {
          ...state.tasks,
          [task.id]: {
            ...task,
            status: 'in_review',
          },
        },
        reviews: {
          ...state.reviews,
          [prevReview.id]: updatedPrevReview,
          [p.newReview.id]: p.newReview,
        },
        people: nextPeople,
        log: appendLog(state.log, event),
      }
    }

    case 'question.asked': {
      const p = event.payload as OfficeEvent<'question.asked'>['payload']
      const { question } = p
      const task = state.tasks[question.taskId]
      const fromPerson = state.people[question.fromId]
      const toPerson = state.people[question.toId]
      if (!task || !fromPerson || !toPerson) {
        return skipWarn(
          state,
          event,
          `unknown taskId/fromId/toId on question.asked`,
        )
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: {
          ...state.tasks,
          [task.id]: {
            ...task,
            status: 'waiting_answer',
          },
        },
        questions: {
          ...state.questions,
          [question.id]: question,
        },
        people: {
          ...state.people,
          [fromPerson.employeeId]: {
            ...fromPerson,
            activity: question.inPerson ? 'waiting_answer' : 'asking',
            taskId: task.id,
            idleSince: null,
            lastActiveAt: event.at,
          },
        },
        log: appendLog(state.log, event),
      }
    }

    case 'question.answered': {
      const p = event.payload as OfficeEvent<'question.answered'>['payload']
      const question = state.questions[p.questionId]
      if (!question) {
        return skipWarn(state, event, `unknown questionId "${p.questionId}"`)
      }
      if (question.status !== 'open') {
        // Answering an expired or already answered question must not put the
        // asker back to work on a task that has moved on.
        return skipWarn(state, event, `question "${question.id}" already ${question.status}`)
      }

      let nextTasks = state.tasks
      const task = state.tasks[question.taskId]
      if (task && task.status === 'waiting_answer') {
        nextTasks = {
          ...state.tasks,
          [task.id]: {
            ...task,
            status: 'in_progress',
          },
        }
      }

      let nextPeople = state.people
      const fromPerson = state.people[question.fromId]
      if (fromPerson && task && nextTasks[task.id]?.status === 'in_progress') {
        nextPeople = {
          ...state.people,
          [fromPerson.employeeId]: {
            ...fromPerson,
            activity: 'working',
            taskId: question.taskId,
            carrying: task ? resolveCarries(state.config, task.typeKey) : fromPerson.carrying,
            platformKey: task ? task.platformKey : fromPerson.platformKey,
            idleSince: null,
            lastActiveAt: event.at,
          },
        }
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: nextTasks,
        questions: {
          ...state.questions,
          [question.id]: {
            ...question,
            status: 'answered',
            answeredAt: event.at,
          },
        },
        people: nextPeople,
        log: appendLog(state.log, event),
      }
    }

    case 'help.requested': {
      const p = event.payload as OfficeEvent<'help.requested'>['payload']
      const { help } = p
      const task = state.tasks[help.taskId]
      const fromPerson = state.people[help.fromId]
      if (!task || !fromPerson) {
        return skipWarn(state, event, `unknown taskId/fromId on help.requested`)
      }
      if (help.toId !== null && !state.people[help.toId]) {
        return skipWarn(state, event, `unknown toId "${help.toId}" on help.requested`)
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: {
          ...state.tasks,
          [task.id]: {
            ...task,
            status: 'waiting_help',
          },
        },
        help: {
          ...state.help,
          [help.id]: help,
        },
        people: {
          ...state.people,
          [fromPerson.employeeId]: {
            ...fromPerson,
            lastActiveAt: event.at,
          },
        },
        log: appendLog(state.log, event),
      }
    }

    case 'help.accepted': {
      const p = event.payload as OfficeEvent<'help.accepted'>['payload']
      const help = state.help[p.helpId]
      const helper = state.people[p.byId]
      if (!help || !helper) {
        return skipWarn(state, event, `unknown helpId/byId on help.accepted`)
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        help: {
          ...state.help,
          [help.id]: {
            ...help,
            status: 'accepted',
            toId: p.byId,
          },
        },
        people: {
          ...state.people,
          [helper.employeeId]: {
            ...helper,
            activity: 'helping',
            idleSince: null,
            lastActiveAt: event.at,
          },
        },
        log: appendLog(state.log, event),
      }
    }

    case 'help.answered': {
      const p = event.payload as OfficeEvent<'help.answered'>['payload']
      const help = state.help[p.helpId]
      const helper = state.people[p.byId]
      if (!help || !helper) {
        return skipWarn(state, event, `unknown helpId/byId on help.answered`)
      }

      let nextTasks = state.tasks
      const task = state.tasks[help.taskId]
      if (task && task.status === 'waiting_help') {
        nextTasks = {
          ...state.tasks,
          [task.id]: {
            ...task,
            status: 'in_progress',
          },
        }
      }

      let nextPeople = state.people
      const helperOwnTask = helper.taskId ? nextTasks[helper.taskId] : null
      if (helperOwnTask && helperOwnTask.status === 'in_progress') {
        nextPeople = {
          ...nextPeople,
          [helper.employeeId]: {
            ...helper,
            activity: 'working',
            idleSince: null,
            lastActiveAt: event.at,
          },
        }
      } else {
        nextPeople = {
          ...nextPeople,
          [helper.employeeId]: {
            ...helper,
            activity: 'idle',
            taskId: null,
            carrying: null,
            platformKey: null,
            idleSince: event.at,
            lastActiveAt: event.at,
          },
        }
      }

      const asker = nextPeople[help.fromId]
      if (asker) {
        nextPeople = {
          ...nextPeople,
          [asker.employeeId]: {
            ...asker,
            activity: 'working',
            taskId: help.taskId,
            idleSince: null,
            lastActiveAt: event.at,
          },
        }
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: nextTasks,
        help: {
          ...state.help,
          [help.id]: {
            ...help,
            status: 'answered',
            toId: p.byId,
          },
        },
        people: nextPeople,
        log: appendLog(state.log, event),
      }
    }

    case 'help.timed_out': {
      const p = event.payload as OfficeEvent<'help.timed_out'>['payload']
      const help = state.help[p.helpId]
      const nextHelper = state.people[p.toId]
      if (!help || !nextHelper) {
        return skipWarn(state, event, `unknown helpId/toId on help.timed_out`)
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        help: {
          ...state.help,
          [help.id]: {
            ...help,
            status: 'timed_out',
            round: help.round + 1,
            toId: p.toId,
          },
        },
        log: appendLog(state.log, event),
      }
    }

    case 'help.escalated': {
      const p = event.payload as OfficeEvent<'help.escalated'>['payload']
      const help = state.help[p.helpId]
      const dm = state.people[p.toId]
      if (!help || !dm) {
        return skipWarn(state, event, `unknown helpId/toId on help.escalated`)
      }

      let nextTasks = state.tasks
      const task = state.tasks[help.taskId]
      if (task && task.status === 'waiting_help') {
        nextTasks = {
          ...state.tasks,
          [task.id]: {
            ...task,
            status: 'in_progress',
          },
        }
      }

      return {
        ...state,
        now: event.at,
        seq: event.seq,
        tasks: nextTasks,
        help: {
          ...state.help,
          [help.id]: {
            ...help,
            status: 'escalated',
            toId: p.toId,
          },
        },
        log: appendLog(state.log, event),
      }
    }

    case 'person.activity': {
      const payload = event.payload as OfficeEvent<'person.activity'>['payload']
      const current = state.people[payload.employeeId]
      if (!current) {
        return skipWarn(state, event, `unknown employeeId "${payload.employeeId}"`)
      }
      const currentTask = current.taskId ? state.tasks[current.taskId] : null
      const clearTaskBinding =
        payload.activity === 'idle' &&
        (!currentTask ||
          currentTask.status === 'in_review' ||
          currentTask.status === 'done' ||
          currentTask.status === 'cancelled' ||
          currentTask.status === 'failed')

      const updatedPerson: PersonRuntime = {
        ...current,
        activity: payload.activity,
        taskId: clearTaskBinding ? null : current.taskId,
        carrying: clearTaskBinding ? null : current.carrying,
        platformKey: clearTaskBinding ? null : current.platformKey,
        idleSince:
          payload.activity === 'idle'
            ? current.activity === 'idle' && current.idleSince
              ? current.idleSince
              : event.at
            : null,
        lastActiveAt: event.at,
        location:
          payload.locationHint !== undefined ? payload.locationHint : current.location,
      }
      return {
        ...state,
        now: event.at,
        seq: event.seq,
        people: {
          ...state.people,
          [payload.employeeId]: updatedPerson,
        },
        log: appendLog(state.log, event),
      }
    }

    case 'staff.hired': {
      const p = event.payload as OfficeEvent<'staff.hired'>['payload']
      const { employee } = p
      if (
        employee.departmentId !== null &&
        !state.config.departments.some((d) => d.id === employee.departmentId)
      ) {
        return skipWarn(
          state,
          event,
          `unknown departmentId "${employee.departmentId}" on staff.hired`,
        )
      }
      const activeEmployee = {
        ...employee,
        state: 'active' as const,
        archivedAt: null,
      }
      const nextConfig = applyConfigChange(
        state.config,
        { kind: 'employee.upsert', employee: activeEmployee },
        event.at,
      )
      return {
        ...state,
        now: event.at,
        seq: event.seq,
        config: nextConfig,
        people: {
          ...state.people,
          [activeEmployee.id]: makeIdlePerson(activeEmployee.id, event.at),
        },
        log: appendLog(state.log, event),
      }
    }

    case 'staff.archived': {
      const p = event.payload as OfficeEvent<'staff.archived'>['payload']
      const exists = state.config.employees.some((e) => e.id === p.employeeId)
      if (!exists) {
        return skipWarn(
          state,
          event,
          `unknown employeeId "${p.employeeId}" on staff.archived`,
        )
      }
      const nextConfig = applyConfigChange(
        state.config,
        { kind: 'employee.archive', id: p.employeeId, reason: p.reason },
        event.at,
      )
      const nextPeople = { ...state.people }
      delete nextPeople[p.employeeId]

      // Work the person had not handed in goes back to the queue, so nobody
      // who no longer exists is left "doing" a task. Tasks already in review
      // keep their assignee: the work is done and only approvals remain.
      let nextTasks = state.tasks
      let nextQuestions = state.questions
      for (const task of Object.values(state.tasks)) {
        if (task.assigneeId !== p.employeeId) continue
        if (
          task.status !== 'queued' &&
          task.status !== 'in_progress' &&
          task.status !== 'waiting_help' &&
          task.status !== 'waiting_answer' &&
          task.status !== 'blocked'
        ) {
          continue
        }
        nextTasks = {
          ...nextTasks,
          [task.id]: {
            ...task,
            status: 'queued',
            assigneeId: null,
            progress: 0,
            startedAt: null,
          },
        }
        for (const q of Object.values(nextQuestions)) {
          if (q.taskId === task.id && q.status === 'open') {
            nextQuestions = {
              ...nextQuestions,
              [q.id]: { ...q, status: 'expired', answeredAt: event.at },
            }
          }
        }
      }

      const archived: OfficeState = {
        ...state,
        now: event.at,
        seq: event.seq,
        config: nextConfig,
        people: nextPeople,
        tasks: nextTasks,
        questions: nextQuestions,
        log: appendLog(state.log, event),
      }

      // Open review items the person still held go to the next approver at the same level
      // (same pick, incl. fallbacks, as a new review), so no task waits on someone gone.
      let nextReviews = archived.reviews
      for (const review of Object.values(state.reviews)) {
        if (review.assigneeId !== p.employeeId) continue
        if (review.status !== 'pending' && review.status !== 'in_review') continue
        const task = state.tasks[review.taskId]
        if (!task) continue
        const to = pickApprover(review.level, task, { ...archived, reviews: nextReviews })
        if (!to) continue
        nextReviews = {
          ...nextReviews,
          [review.id]: { ...review, assigneeId: to, status: 'pending' },
        }
      }
      return nextReviews === archived.reviews ? archived : { ...archived, reviews: nextReviews }
    }

    case 'config.changed': {
      const payload = event.payload as OfficeEvent<'config.changed'>['payload']
      const nextConfig = applyConfigChange(state.config, payload.change, event.at)
      return {
        ...withConfig(state, nextConfig, event.at),
        now: event.at,
        seq: event.seq,
        log: appendLog(state.log, event),
      }
    }

    case 'system.heartbeat': {
      const payload = event.payload as OfficeEvent<'system.heartbeat'>['payload']
      const advanced: OfficeState = {
        ...state,
        now: event.at,
        seq: event.seq,
        lastHeartbeat: {
          at: event.at,
          source: payload.source,
          version: payload.version,
        },
        // Not logged: one per sim minute would fill the 500-event activity
        // ring with noise (56% of it over a few days). Liveness is read from
        // `lastHeartbeat`.
      }
      // Once per feed hour, drop finished work past the retention window so
      // state (and every selector over it) stays bounded on long runs.
      return crossedHour(state.now, event.at) ? pruneFinished(advanced) : advanced
    }

    case 'sim.scenario': {
      return {
        ...state,
        now: event.at,
        seq: event.seq,
        log: appendLog(state.log, event),
      }
    }

    default: {
      const _exhaustive: never = event
      void _exhaustive
      return state
    }
  }
}

export function applyAll(
  state: OfficeState,
  events: readonly OfficeEvent[],
): OfficeState {
  let next = state
  for (const evt of events) {
    next = apply(next, evt)
  }
  return next
}

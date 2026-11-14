// In-memory stand-in for Supabase + n8n so the MVP runs with no backend.
// - Reads: src/lib/api.ts calls the getters below.
// - Realtime: `subscribe` fires with the table name on every change (RealtimeProvider listens).
// - Commands: `insertCommand` is the ONLY write the UI makes; the fake "n8n" below applies it.
// Swapping to Supabase later = replace api.ts + RealtimeProvider + commands.ts internals.
import type { CommandType, EmployeeKey, Json, OwnerKey, Tables } from '@/lib/database.types'
import * as seed from './seed'

export type TableName =
  | 'shops'
  | 'employees'
  | 'workflows'
  | 'workflow_steps'
  | 'tasks'
  | 'task_steps'
  | 'approvals'
  | 'artifacts'
  | 'events'
  | 'commands'
  | 'system_status'

export type ConnectionState = 'live' | 'reconnecting' | 'offline'

const clone = <T,>(v: T): T => structuredClone(v)
const nowIso = () => new Date().toISOString()

const db = {
  shops: clone(seed.shops),
  employees: clone(seed.employees),
  workflows: clone(seed.workflows),
  workflow_steps: clone(seed.workflowSteps),
  tasks: clone(seed.tasks),
  task_steps: clone(seed.taskSteps),
  approvals: clone(seed.approvals),
  artifacts: clone(seed.artifacts),
  events: clone(seed.events),
  commands: [] as Tables<'commands'>[],
  system_status: clone(seed.systemStatus),
}

let nextTaskId = Math.max(...db.tasks.map((t) => t.id)) + 1
let nextStepId = Math.max(...db.task_steps.map((s) => s.id)) + 1
let nextApprovalId = Math.max(...db.approvals.map((a) => a.id)) + 1
let nextArtifactId = Math.max(...db.artifacts.map((a) => a.id)) + 1
let nextEventId = Math.max(...db.events.map((e) => e.id)) + 1

// ---------- subscriptions ----------
type Listener = (table: TableName) => void
const listeners = new Set<Listener>()
let emitCount = 0
export function subscribe(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function getEmitCount() {
  return emitCount
}
export function resetEmitCount() {
  emitCount = 0
}
function emit(...tables: TableName[]) {
  emitCount += 1
  for (const t of new Set(tables)) listeners.forEach((l) => l(t))
}

let connection: ConnectionState = 'live'
const connListeners = new Set<(c: ConnectionState) => void>()
export function getConnection() {
  return connection
}
export function subscribeConnection(fn: (c: ConnectionState) => void) {
  connListeners.add(fn)
  return () => connListeners.delete(fn)
}
/** Demo control: simulate the realtime socket dropping / reconnecting. */
export function setConnection(c: ConnectionState) {
  connection = c
  connListeners.forEach((l) => l(c))
}

let teamOnline = true
/** Demo control: simulate the n8n PC being switched off (heartbeat goes stale, commands stay pending). */
export function setTeamOnline(online: boolean) {
  teamOnline = online
  db.system_status.n8n_heartbeat_at = online ? nowIso() : new Date(Date.now() - 10 * 60_000).toISOString()
  emit('system_status')
  if (online) db.commands.filter((c) => c.status === 'pending').forEach((c) => scheduleProcessing(c.id))
}
export function isTeamOnline() {
  return teamOnline
}

// ---------- reads ----------
export const read = {
  shops: () => clone(db.shops),
  employees: () => clone(db.employees),
  workflows: () => clone(db.workflows),
  workflowSteps: () => clone(db.workflow_steps),
  tasks: () => clone(db.tasks).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  task: (id: number) => clone(db.tasks.find((t) => t.id === id) ?? null),
  taskSteps: (taskId: number) => clone(db.task_steps.filter((s) => s.task_id === taskId)).sort((a, b) => a.position - b.position),
  allTaskSteps: () => clone(db.task_steps),
  approvals: () => clone(db.approvals).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  artifacts: () => clone(db.artifacts).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  events: (limit = 100) => clone(db.events).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit),
  taskEvents: (taskId: number) => clone(db.events.filter((e) => e.task_id === taskId)).sort((a, b) => b.at.localeCompare(a.at)),
  command: (id: string) => clone(db.commands.find((c) => c.id === id) ?? null),
  systemStatus: () => clone(db.system_status),
}

// ---------- helpers used by the fake n8n ----------
const stepsOf = (taskId: number) => db.task_steps.filter((s) => s.task_id === taskId).sort((a, b) => a.position - b.position)
const defOf = (wf: string, key: string) => db.workflow_steps.find((s) => s.workflow_key === wf && s.key === key)
const touch = (task: Tables<'tasks'>) => {
  task.updated_at = nowIso()
}

function log(task_id: number | null, actor: string, type: string, message: string, data: Json | null = null) {
  db.events.push({ id: nextEventId++, at: nowIso(), task_id, actor, type, message, data })
}

/** Who "owns" a task right now, for the employee cards. For an approval gate it is the owner of the risky step after it. */
function responsibleOwner(task: Tables<'tasks'>): OwnerKey | null {
  const steps = stepsOf(task.id)
  const idx = steps.findIndex((s) => s.step_key === task.current_step_key)
  if (idx < 0) return null
  const cur = steps[idx]
  if (cur.owner_key !== 'boss') return cur.owner_key
  return steps.slice(idx + 1).find((s) => s.owner_key !== 'boss')?.owner_key ?? steps.slice(0, idx).reverse().find((s) => s.owner_key !== 'boss')?.owner_key ?? null
}

function recomputeEmployees() {
  const active = db.tasks
    .filter((t) => t.status === 'running' || t.status === 'waiting_boss' || t.status === 'blocked')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  for (const emp of db.employees) {
    const mine = active.find((t) => responsibleOwner(t) === emp.key)
    const nextStatus = !mine ? 'idle' : mine.status === 'running' ? 'working' : mine.status === 'waiting_boss' ? 'waiting_boss' : 'blocked'
    if (emp.status !== nextStatus || emp.current_task_id !== (mine?.id ?? null)) emp.status_since = nowIso()
    emp.status = nextStatus
    emp.current_task_id = mine?.id ?? null
    emp.current_step_key = mine?.current_step_key ?? null
  }
}

const shopName = (id: number) => db.shops.find((s) => s.id === id)?.name ?? `#${id}`

function makeApprovalPayload(task: Tables<'tasks'>, owner: EmployeeKey): Json {
  switch (task.workflow_key) {
    case 'review_reply':
      return {
        type: 'review_replies',
        prepared_by: owner,
        checked_by: 'an',
        items: [
          { review_id: `R-${task.id}-1`, stars: 2, customer: 'Lan Phương', product: 'Nồi chiên không dầu 5L', text: 'Nồi dùng được nhưng hộp bị móp khi nhận.', draft: 'Dạ shop thành thật xin lỗi chị Phương vì hộp bị móp khi giao ạ. Shop đã gửi chị một phần quà nhỏ kèm mã giảm giá, và sẽ đóng gói kỹ hơn cho các đơn sau ạ.' },
          { review_id: `R-${task.id}-2`, stars: 5, customer: 'Quốc Bảo', product: 'Bộ nồi inox 5 món', text: 'Hàng đẹp, giao nhanh.', draft: 'Cảm ơn anh Bảo nhiều ạ! Chúc anh và gia đình có những bữa cơm thật ấm cúng.' },
        ],
      }
    case 'banner_set':
    case 'social_post': {
      const sizes = task.workflow_key === 'banner_set' ? ['1200×628', '1080×1080'] : ['1080×1080']
      const ids = sizes.map((size) => {
        const id = nextArtifactId++
        const [w, h] = size.split('×').map(Number)
        db.artifacts.push({
          id, task_id: task.id, shop_id: task.shop_id, workflow_key: task.workflow_key, owner_key: 'vy', type: 'image',
          title: `${task.brief ?? shopName(task.shop_id)} · ${size}`, drive_file_id: `demo-${id}`, drive_url: `https://drive.google.com/file/d/demo-${id}/view`,
          drive_folder_id: null, mime: 'image/png', size_bytes: 760_000, width: w, height: h, duration_sec: null, provider: 'demo', created_at: nowIso(),
        })
        return id
      })
      if (task.workflow_key === 'banner_set') return { type: 'images', prepared_by: owner, checked_by: 'an', artifact_ids: ids }
      return { type: 'post', prepared_by: 'ha', checked_by: 'an', channel: 'zalo', text: `✨ ${task.brief ?? 'Sản phẩm mới'} đã có mặt tại ${shopName(task.shop_id)}! Ưu đãi riêng cho khách quen trong tuần này. Nhắn shop để được tư vấn nhé!`, artifact_id: ids[0] }
    }
    default:
      return { type: 'generic', prepared_by: owner, checked_by: 'an', summary: task.brief ?? '' }
  }
}

/** Finish the current step and move on (what n8n's log_step calls would do). */
function advance(task: Tables<'tasks'>) {
  const steps = stepsOf(task.id)
  let idx = steps.findIndex((s) => s.step_key === task.current_step_key)
  if (idx >= 0) {
    const cur = steps[idx]
    cur.status = 'done'
    cur.finished_at = nowIso()
    cur.summary = cur.summary ?? null
    const def = defOf(task.workflow_key, cur.step_key)
    log(task.id, cur.owner_key, 'step_done', `${def?.label ?? cur.step_key} (#${task.id})`, { step_key: cur.step_key })
  }
  idx += 1
  while (idx < steps.length) {
    const next = steps[idx]
    const def = defOf(task.workflow_key, next.step_key)
    if (def?.kind === 'approval') {
      const riskyOwner = steps.slice(idx + 1).find((s) => s.owner_key !== 'boss')?.owner_key as EmployeeKey | undefined
      const ownerAsks = db.employees.find((e) => e.key === riskyOwner)?.autonomy !== 'works_alone'
      if (task.require_approval || ownerAsks) {
        next.status = 'running'
        next.started_at = nowIso()
        task.current_step_key = next.step_key
        task.status = 'waiting_boss'
        const wfName = db.workflows.find((w) => w.key === task.workflow_key)?.name ?? task.workflow_key
        db.approvals.push({
          id: nextApprovalId++, task_id: task.id, step_key: next.step_key, kind: 'approval',
          title: `${wfName} · ${shopName(task.shop_id)}`, payload: makeApprovalPayload(task, riskyOwner ?? 'thu'),
          status: 'open', resolved_via: null, resolved_at: null, note: null, created_at: nowIso(),
        })
        log(task.id, riskyOwner ?? 'thu', 'approval_requested', `#${task.id}`)
        touch(task)
        return
      }
      next.status = 'skipped'
      next.summary = 'works_alone'
      next.finished_at = nowIso()
      idx += 1
      continue
    }
    next.status = 'running'
    next.started_at = nowIso()
    task.current_step_key = next.step_key
    task.status = 'running'
    log(task.id, next.owner_key, 'step_started', `${def?.label ?? next.step_key} (#${task.id})`, { step_key: next.step_key })
    touch(task)
    return
  }
  task.status = 'done'
  task.current_step_key = null
  task.finished_at = nowIso()
  log(task.id, 'thu', 'task_done', `#${task.id}`)
  touch(task)
}

function startQueued() {
  const busy = new Set(db.employees.filter((e) => e.status !== 'idle').map((e) => e.key))
  for (const task of db.tasks.filter((t) => t.status === 'queued').sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const first = stepsOf(task.id)[0]
    if (!first || busy.has(first.owner_key as EmployeeKey)) continue
    busy.add(first.owner_key as EmployeeKey)
    first.status = 'running'
    first.started_at = nowIso()
    task.status = 'running'
    task.current_step_key = first.step_key
    log(task.id, first.owner_key, 'step_started', `#${task.id}`, { step_key: first.step_key })
    touch(task)
  }
}

function createTask(p: { workflow_key: string; shop_id: number; brief?: string | null; require_approval: boolean }): Tables<'tasks'> {
  const task: Tables<'tasks'> = {
    id: nextTaskId++, workflow_key: p.workflow_key, shop_id: p.shop_id, brief: p.brief ?? null, require_approval: p.require_approval,
    status: 'queued', source: 'dashboard', current_step_key: null, blocked_reason: null, created_at: nowIso(), updated_at: nowIso(), finished_at: null,
  }
  db.tasks.push(task)
  for (const def of db.workflow_steps.filter((s) => s.workflow_key === p.workflow_key).sort((a, b) => a.position - b.position)) {
    db.task_steps.push({ id: nextStepId++, task_id: task.id, step_key: def.key, position: def.position, owner_key: def.owner_key, status: 'pending', summary: null, output: null, started_at: null, finished_at: null, error: null, attempt: 1 })
  }
  log(task.id, 'boss', 'task_created', `#${task.id}`, { source: 'dashboard' })
  return task
}

// ---------- commands (the only write path) ----------
type Obj = Record<string, Json | undefined>
const asObj = (j: Json): Obj => (j && typeof j === 'object' && !Array.isArray(j) ? (j as Obj) : {})

function applyCommand(cmd: Tables<'commands'>): string | null {
  const p = asObj(cmd.payload)
  const approval = typeof p.approval_id === 'number' ? db.approvals.find((a) => a.id === p.approval_id) : undefined
  const resolve = (status: Tables<'approvals'>['status']) => {
    if (!approval) throw new Error('approval_not_found')
    if (approval.status !== 'open') throw new Error(`already_resolved_via_${approval.resolved_via ?? 'telegram'}`)
    approval.status = status
    approval.resolved_via = 'dashboard'
    approval.resolved_at = nowIso()
    approval.note = typeof p.note === 'string' ? p.note : typeof p.answer === 'string' ? p.answer : null
    return db.tasks.find((t) => t.id === approval.task_id)!
  }

  switch (cmd.type) {
    case 'start_task': {
      const task = createTask({ workflow_key: String(p.workflow_key), shop_id: Number(p.shop_id), brief: typeof p.brief === 'string' ? p.brief : null, require_approval: p.require_approval === true })
      return `task:${task.id}`
    }
    case 'approve': {
      const task = resolve('approved')
      log(task.id, 'boss', 'approved', `#${task.id}`, { via: 'dashboard' })
      advance(task)
      return null
    }
    case 'reject': {
      const task = resolve('rejected')
      task.status = 'cancelled'
      task.finished_at = nowIso()
      task.current_step_key = null
      log(task.id, 'boss', 'rejected', `#${task.id}`, { note: approval?.note ?? null })
      touch(task)
      return null
    }
    case 'request_changes': {
      const task = resolve('changes_requested')
      const steps = stepsOf(task.id)
      const gateIdx = steps.findIndex((s) => s.step_key === approval!.step_key)
      const qcIdx = steps.findIndex((s, i) => i < gateIdx && defOf(task.workflow_key, s.step_key)?.kind === 'qc')
      const back = steps[Math.max(0, qcIdx - 1)]
      for (const s of steps.slice(steps.indexOf(back))) {
        s.status = 'pending'
        s.finished_at = null
      }
      back.status = 'running'
      back.started_at = nowIso()
      back.attempt += 1
      task.status = 'running'
      task.current_step_key = back.step_key
      log(task.id, 'boss', 'changes_requested', `#${task.id}`, { note: approval?.note ?? null })
      touch(task)
      return null
    }
    case 'answer': {
      const task = resolve('answered')
      task.status = 'running'
      const cur = stepsOf(task.id).find((s) => s.step_key === task.current_step_key)
      if (cur) {
        cur.status = 'running'
        cur.started_at = nowIso()
      }
      log(task.id, 'boss', 'answered', `#${task.id}`, { answer: approval?.note ?? null })
      touch(task)
      return null
    }
    case 'set_autonomy': {
      const emp = db.employees.find((e) => e.key === p.employee_key)
      if (!emp) throw new Error('employee_not_found')
      emp.autonomy = p.autonomy === 'works_alone' ? 'works_alone' : 'ask_first'
      log(null, 'boss', 'autonomy_changed', emp.key, { autonomy: emp.autonomy })
      return null
    }
    case 'retry_step': {
      const task = db.tasks.find((t) => t.id === p.task_id)
      if (!task) throw new Error('task_not_found')
      const cur = stepsOf(task.id).find((s) => s.step_key === (typeof p.step_key === 'string' ? p.step_key : task.current_step_key))
      if (cur) {
        cur.status = 'running'
        cur.error = null
        cur.attempt += 1
        cur.started_at = nowIso()
      }
      task.status = 'running'
      task.blocked_reason = null
      log(task.id, 'boss', 'retry', `#${task.id}`)
      touch(task)
      return null
    }
    case 'cancel_task': {
      const task = db.tasks.find((t) => t.id === p.task_id)
      if (!task) throw new Error('task_not_found')
      task.status = 'cancelled'
      task.current_step_key = null
      task.finished_at = nowIso()
      db.approvals.filter((a) => a.task_id === task.id && a.status === 'open').forEach((a) => (a.status = 'expired'))
      log(task.id, 'boss', 'task_cancelled', `#${task.id}`)
      touch(task)
      return null
    }
    case 'reassign': {
      const step = db.task_steps.find((s) => s.task_id === p.task_id && s.step_key === p.step_key)
      if (!step) throw new Error('step_not_found')
      step.owner_key = String(p.to_owner_key) as OwnerKey
      log(Number(p.task_id), 'boss', 'reassigned', `#${p.task_id}`, { to: step.owner_key })
      return null
    }
  }
}

const ALL_STATE: TableName[] = ['tasks', 'task_steps', 'approvals', 'employees', 'events', 'artifacts', 'commands']

function scheduleProcessing(id: string) {
  setTimeout(() => {
    const cmd = db.commands.find((c) => c.id === id)
    if (!cmd || cmd.status !== 'pending' || !teamOnline) return
    cmd.status = 'accepted'
    emit('commands')
    setTimeout(() => {
      try {
        cmd.result = applyCommand(cmd)
        cmd.status = 'applied'
      } catch (e) {
        cmd.status = 'failed'
        cmd.result = e instanceof Error ? e.message : 'error'
      }
      cmd.processed_at = nowIso()
      startQueued()
      recomputeEmployees()
      emit(...ALL_STATE)
    }, 900)
  }, 500)
}

export function insertCommand(type: CommandType, payload: Json): Tables<'commands'> {
  const cmd: Tables<'commands'> = { id: crypto.randomUUID(), created_at: nowIso(), created_by: 'demo-boss', type, payload, status: 'pending', result: null, processed_at: null }
  db.commands.push(cmd)
  emit('commands')
  scheduleProcessing(cmd.id)
  return clone(cmd)
}

// ---------- background simulator: makes the team look alive ----------
let simTimer: ReturnType<typeof setInterval> | null = null
let hbTimer: ReturnType<typeof setInterval> | null = null
export function startSimulator(stepEveryMs = 9000) {
  if (simTimer) return
  simTimer = setInterval(() => {
    if (!teamOnline) return
    const running = db.tasks.filter((t) => t.status === 'running').sort((a, b) => a.updated_at.localeCompare(b.updated_at))
    const task = running[0]
    if (task) advance(task)
    startQueued()
    recomputeEmployees()
    emit('tasks', 'task_steps', 'approvals', 'employees', 'events', 'artifacts')
  }, stepEveryMs)
  hbTimer = setInterval(() => {
    if (!teamOnline) return
    db.system_status.n8n_heartbeat_at = nowIso()
    emit('system_status')
  }, 30_000)
}
export function stopSimulator() {
  if (simTimer) clearInterval(simTimer)
  if (hbTimer) clearInterval(hbTimer)
  simTimer = hbTimer = null
}

import type { ConfigChange, OrgConfig } from './config'
import { EVENT_TYPES, type EventType, type OfficeEvent } from './events'
import type { EmployeeId, Iso } from './primitives'
import type { OfficeState, PersonRuntime } from './work'

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

export function applyConfigChange(
  config: OrgConfig,
  change: ConfigChange,
  now?: Iso,
): OrgConfig {
  switch (change.kind) {
    case 'department.upsert': {
      const exists = config.departments.some((d) => d.id === change.department.id)
      const departments = exists
        ? config.departments.map((d) => (d.id === change.department.id ? change.department : d))
        : [...config.departments, change.department]
      return { ...config, departments }
    }
    case 'department.reorder': {
      const orderMap = new Map(change.ids.map((id, i) => [id, i + 1]))
      const departments = config.departments.map((d) =>
        orderMap.has(d.id) ? { ...d, order: orderMap.get(d.id)! } : d,
      )
      return { ...config, departments }
    }
    case 'role.upsert': {
      const exists = config.roles.some((r) => r.key === change.role.key)
      const roles = exists
        ? config.roles.map((r) => (r.key === change.role.key ? change.role : r))
        : [...config.roles, change.role]
      return { ...config, roles }
    }
    case 'role.delete': {
      return { ...config, roles: config.roles.filter((r) => r.key !== change.key) }
    }
    case 'specialty.upsert': {
      const exists = config.specialties.some((s) => s.key === change.specialty.key)
      const specialties = exists
        ? config.specialties.map((s) => (s.key === change.specialty.key ? change.specialty : s))
        : [...config.specialties, change.specialty]
      return { ...config, specialties }
    }
    case 'specialty.delete': {
      return {
        ...config,
        specialties: config.specialties.filter((s) => s.key !== change.key),
      }
    }
    case 'employee.upsert': {
      const exists = config.employees.some((e) => e.id === change.employee.id)
      const employees = exists
        ? config.employees.map((e) => (e.id === change.employee.id ? change.employee : e))
        : [...config.employees, change.employee]
      return { ...config, employees }
    }
    case 'employee.archive': {
      const employees = config.employees.map((e) =>
        e.id === change.id
          ? { ...e, state: 'archived' as const, archivedAt: now ?? e.archivedAt }
          : e,
      )
      return { ...config, employees }
    }
    case 'employee.restore': {
      const employees = config.employees.map((e) =>
        e.id === change.id ? { ...e, state: 'active' as const, archivedAt: null } : e,
      )
      return { ...config, employees }
    }
    case 'policy.set': {
      return { ...config, policy: change.policy }
    }
    case 'rule.upsert': {
      const exists = config.approvalRules.some((r) => r.id === change.rule.id)
      const approvalRules = exists
        ? config.approvalRules.map((r) => (r.id === change.rule.id ? change.rule : r))
        : [...config.approvalRules, change.rule]
      return { ...config, approvalRules }
    }
    case 'rule.delete': {
      return {
        ...config,
        approvalRules: config.approvalRules.filter((r) => r.id !== change.id),
      }
    }
    case 'rule.reorder': {
      const orderMap = new Map(change.ids.map((id, i) => [id, i + 1]))
      const approvalRules = config.approvalRules.map((r) =>
        orderMap.has(r.id) ? { ...r, order: orderMap.get(r.id)! } : r,
      )
      return { ...config, approvalRules }
    }
    case 'platform.upsert': {
      const exists = config.platforms.some((p) => p.key === change.platform.key)
      const platforms = exists
        ? config.platforms.map((p) => (p.key === change.platform.key ? change.platform : p))
        : [...config.platforms, change.platform]
      return { ...config, platforms }
    }
    case 'shop.upsert': {
      const exists = config.shops.some((s) => s.id === change.shop.id)
      const shops = exists
        ? config.shops.map((s) => (s.id === change.shop.id ? change.shop : s))
        : [...config.shops, change.shop]
      return { ...config, shops }
    }
    case 'taskType.upsert': {
      const exists = config.taskTypes.some((t) => t.key === change.taskType.key)
      const taskTypes = exists
        ? config.taskTypes.map((t) => (t.key === change.taskType.key ? change.taskType : t))
        : [...config.taskTypes, change.taskType]
      return { ...config, taskTypes }
    }
    case 'config.replace': {
      return change.config
    }
  }
}

function appendLog(log: OfficeEvent[], event: OfficeEvent): OfficeEvent[] {
  const next = [...log, event]
  return next.length > MAX_LOG_SIZE ? next.slice(next.length - MAX_LOG_SIZE) : next
}

export function apply(state: OfficeState, event: OfficeEvent): OfficeState {
  if (event.seq <= state.seq) {
    return state
  }
  if (!KNOWN_EVENT_TYPES.has(event.type as EventType)) {
    return state
  }

  switch (event.type) {
    case 'person.activity': {
      const payload = event.payload as OfficeEvent<'person.activity'>['payload']
      const current = state.people[payload.employeeId]
      if (!current) {
        return state
      }
      const updatedPerson: PersonRuntime = {
        ...current,
        activity: payload.activity,
        idleSince: payload.activity === 'idle' ? event.at : null,
        lastActiveAt: event.at,
        location: payload.locationHint !== undefined ? payload.locationHint : current.location,
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

    case 'config.changed': {
      const payload = event.payload as OfficeEvent<'config.changed'>['payload']
      const nextConfig = applyConfigChange(state.config, payload.change, event.at)
      const nextPeople: Record<EmployeeId, PersonRuntime> = {}
      for (const emp of nextConfig.employees) {
        if (emp.state === 'active') {
          nextPeople[emp.id] = state.people[emp.id] ?? makeIdlePerson(emp.id, event.at)
        }
      }
      return {
        ...state,
        now: event.at,
        seq: event.seq,
        config: nextConfig,
        people: nextPeople,
        log: appendLog(state.log, event),
      }
    }

    case 'system.heartbeat': {
      const payload = event.payload as OfficeEvent<'system.heartbeat'>['payload']
      return {
        ...state,
        now: event.at,
        seq: event.seq,
        lastHeartbeat: {
          at: event.at,
          source: payload.source,
          version: payload.version,
        },
        log: appendLog(state.log, event),
      }
    }

    default: {
      // Remaining event types are implemented in P03.
      return {
        ...state,
        now: event.at,
        seq: event.seq,
        log: appendLog(state.log, event),
      }
    }
  }
}

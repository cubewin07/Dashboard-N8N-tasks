import approvalRulesJson from '@/content/approval-rules.json'
import buildingJson from '@/content/building.json'
import bossTemplateJson from '@/content/floor-templates/boss.json'
import departmentTemplateJson from '@/content/floor-templates/department.json'
import gamesRestTemplateJson from '@/content/floor-templates/games_rest.json'
import lobbyCafeTemplateJson from '@/content/floor-templates/lobby_cafe.json'
import managementTemplateJson from '@/content/floor-templates/management.json'
import orgSeedJson from '@/content/org.seed.json'
import paletteJson from '@/content/palette.json'
import platformsJson from '@/content/platforms.json'
import policyJson from '@/content/policy.json'
import rolesJson from '@/content/roles.json'
import specialtiesJson from '@/content/specialties.json'
import taskTypesJson from '@/content/task-types.json'
import {
  FloorTemplateSchema,
  parseOrgConfig,
  type ApprovalRule,
  type BuildingConfig,
  type Department,
  type Employee,
  type FloorTemplate,
  type OrgConfig,
  type PaletteSwatch,
  type Platform,
  type Policy,
  type RoleDef,
  type Shop,
  type Specialty,
  type TaskType,
} from '../config'
import type { Command, CommandPayloads, CommandType } from '../commands'
import type { EventPayloads, EventType, OfficeEvent } from '../events'
import { newId } from '../ids'
import type { CommandId, EventId, IdPrefix, Iso } from '../primitives'
import { initialState } from '../reducer'
import type { OfficeState, Task } from '../work'

const BASE_EPOCH_MS = Date.UTC(2026, 10, 10, 8, 0, 0)

export function t(minutes = 0): Iso {
  return new Date(BASE_EPOCH_MS + minutes * 60_000).toISOString()
}

export function createTestIdFactory() {
  let counter = 0
  return {
    ulid: () => {
      counter += 1
      return `01JTEST${String(counter).padStart(19, '0')}`
    },
    id: <P extends IdPrefix>(prefix: P) => {
      counter += 1
      return newId(prefix, () => `01JTEST${String(counter).padStart(19, '0')}`)
    },
  }
}

export const DEFAULT_POLICY: Policy = {
  staffing: {
    tempCap: 10,
    dropOrder: 'longest_idle_first',
    minIdleMinutesBeforeDrop: 60,
  },
  help: {
    timeoutMinutes: 30,
    maxRounds: 2,
    escalateTo: 'dept_manager',
  },
  priority: {
    weights: { urgent: 400, high: 300, normal: 200, low: 100 },
    agingPointsPerHour: 20,
    agingCapPoints: 150,
  },
  approvals: {
    defaultLevel: 'dept_manager',
    chain: 'every_level_up_to_required',
    questionSeatThreshold: 3,
  },
  work: {
    oneActiveTaskPerWorker: true,
    maxRetries: 2,
    maxQuestionsPerTask: 1,
  },
  calendar: {
    timezone: 'Asia/Ho_Chi_Minh',
    workStart: '08:00',
    workEnd: '17:30',
    lunch: ['12:00', '13:00'],
  },
}

export const DEFAULT_ROLES: RoleDef[] = [
  {
    key: 'owner',
    label: { vi: 'Chủ sở hữu', en: 'Owner' },
    scope: 'building',
    caps: {
      assignTasks: true,
      approveLevel: 'boss',
      distributeReviews: false,
      answerQuestions: true,
      doWork: false,
      humanOwner: true,
    },
    modelTier: 'strong',
    maxPerDepartment: null,
    workspace: 'boss_office',
    sortOrder: 0,
  },
  {
    key: 'manager',
    label: { vi: 'Quản lý điều hành', en: 'General Manager' },
    scope: 'building',
    caps: {
      assignTasks: true,
      approveLevel: null,
      distributeReviews: false,
      answerQuestions: true,
      doWork: false,
      humanOwner: false,
    },
    modelTier: 'strong',
    maxPerDepartment: null,
    workspace: 'manager_office',
    sortOrder: 1,
  },
  {
    key: 'dept_manager',
    label: { vi: 'Trưởng phòng', en: 'Department Manager' },
    scope: 'department',
    caps: {
      assignTasks: true,
      approveLevel: 'dept_manager',
      distributeReviews: false,
      answerQuestions: true,
      doWork: false,
      humanOwner: false,
    },
    modelTier: 'strong',
    maxPerDepartment: 1,
    workspace: 'private_office',
    sortOrder: 2,
  },
  {
    key: 'lead',
    label: { vi: 'Trưởng nhóm', en: 'Team Lead' },
    scope: 'department',
    caps: {
      assignTasks: false,
      approveLevel: null,
      distributeReviews: true,
      answerQuestions: true,
      doWork: true,
      humanOwner: false,
    },
    modelTier: 'standard',
    maxPerDepartment: 1,
    workspace: 'review_desk',
    sortOrder: 3,
  },
  {
    key: 'reviewer',
    label: { vi: 'Kiểm duyệt', en: 'Reviewer' },
    scope: 'department',
    caps: {
      assignTasks: false,
      approveLevel: 'reviewer',
      distributeReviews: false,
      answerQuestions: false,
      doWork: false,
      humanOwner: false,
    },
    modelTier: 'cheap',
    maxPerDepartment: null,
    workspace: 'review_desk',
    sortOrder: 4,
  },
  {
    key: 'worker',
    label: { vi: 'Nhân viên', en: 'Worker' },
    scope: 'department',
    caps: {
      assignTasks: false,
      approveLevel: null,
      distributeReviews: false,
      answerQuestions: false,
      doWork: true,
      humanOwner: false,
    },
    modelTier: 'standard',
    maxPerDepartment: null,
    workspace: 'desk',
    sortOrder: 5,
  },
]

export const DEFAULT_BUILDING: BuildingConfig = {
  floorHeight: 4.0,
  stack: [
    { kind: 'fixed', key: 'lobby_cafe', template: 'lobby_cafe' },
    { kind: 'departments' },
    { kind: 'fixed', key: 'games_rest', template: 'games_rest' },
    { kind: 'fixed', key: 'management', template: 'management' },
  ],
  elevator: {
    cars: 2,
    speedFloorsPerSec: 1.5,
    doorSeconds: 1.2,
    capacity: 6,
  },
}

export const DEFAULT_PALETTE: PaletteSwatch[] = [
  { key: 'cs', label: { vi: 'Xanh da trời', en: 'Sky' }, hex: '#0284c7', softHex: '#e0f2fe' },
  { key: 'marketing', label: { vi: 'Tím', en: 'Violet' }, hex: '#7c3aed', softHex: '#ede9fe' },
  { key: 'design', label: { vi: 'Hồng', en: 'Pink' }, hex: '#db2777', softHex: '#fce7f3' },
  { key: 'accounting', label: { vi: 'Hổ phách', en: 'Amber' }, hex: '#d97706', softHex: '#fef3c7' },
  { key: 'management', label: { vi: 'Ngọc bích', en: 'Jade' }, hex: '#0f766e', softHex: '#e6f2f1' },
  { key: 'boss', label: { vi: 'Vàng đậm', en: 'Executive Gold' }, hex: '#92400e', softHex: '#fef3c7' },
  { key: 'leisure', label: { vi: 'Xanh ngọc', en: 'Teal' }, hex: '#0d9488', softHex: '#ccfbf1' },
]

export const DEFAULT_FLOOR_TEMPLATES: FloorTemplate[] = [
  FloorTemplateSchema.parse(bossTemplateJson),
  FloorTemplateSchema.parse(departmentTemplateJson),
  FloorTemplateSchema.parse(gamesRestTemplateJson),
  FloorTemplateSchema.parse(lobbyCafeTemplateJson),
  FloorTemplateSchema.parse(managementTemplateJson),
]

export function makeSeedConfig(overrides: Partial<OrgConfig> = {}): OrgConfig {
  const base = parseOrgConfig({
    departments: orgSeedJson.departments,
    employees: orgSeedJson.employees,
    shops: orgSeedJson.shops,
    roles: rolesJson,
    specialties: specialtiesJson,
    platforms: platformsJson,
    approvalRules: approvalRulesJson,
    policy: policyJson,
    taskTypes: taskTypesJson,
    building: buildingJson,
    floorTemplates: DEFAULT_FLOOR_TEMPLATES,
    palette: paletteJson,
  })
  return {
    ...base,
    ...overrides,
  }
}

export function makeConfig(overrides: Partial<OrgConfig> = {}): OrgConfig {
  const departments: Department[] = overrides.departments ?? [
    {
      id: 'dep_cs',
      key: 'cs',
      label: { vi: 'Chăm sóc khách hàng', en: 'Customer Support' },
      order: 1,
      colorSwatch: 'cs',
      icon: 'Headset',
      hours: '24_7',
      floorTemplate: 'department',
      active: true,
    },
  ]
  const specialties: Specialty[] = overrides.specialties ?? [
    {
      key: 'customer_chat',
      label: { vi: 'Trả lời tin nhắn', en: 'Customer Chat' },
      icon: 'MessageSquare',
      homeDepartmentKey: 'cs',
    },
  ]
  const employees: Employee[] = overrides.employees ?? [
    {
      id: 'emp_owner_1',
      name: 'Giám đốc',
      departmentId: null,
      roleKey: 'owner',
      specialties: [],
      kind: 'core',
      state: 'active',
      reviewMode: 'always',
      modelTierOverride: null,
      bio: null,
      createdAt: '2026-11-10T00:00:00Z',
      createdBy: 'seed',
      archivedAt: null,
    },
    {
      id: 'emp_thu',
      name: 'Thu',
      departmentId: null,
      roleKey: 'manager',
      specialties: [],
      kind: 'core',
      state: 'active',
      reviewMode: 'always',
      modelTierOverride: null,
      bio: null,
      createdAt: '2026-11-10T00:00:00Z',
      createdBy: 'seed',
      archivedAt: null,
    },
    {
      id: 'emp_ngoc',
      name: 'Ngọc',
      departmentId: 'dep_cs',
      roleKey: 'dept_manager',
      specialties: ['customer_chat'],
      kind: 'core',
      state: 'active',
      reviewMode: 'always',
      modelTierOverride: null,
      bio: null,
      createdAt: '2026-11-10T00:00:00Z',
      createdBy: 'seed',
      archivedAt: null,
    },
    {
      id: 'emp_mai',
      name: 'Mai',
      departmentId: 'dep_cs',
      roleKey: 'worker',
      specialties: ['customer_chat'],
      kind: 'core',
      state: 'active',
      reviewMode: 'always',
      modelTierOverride: null,
      bio: null,
      createdAt: '2026-11-10T00:00:00Z',
      createdBy: 'seed',
      archivedAt: null,
    },
  ]
  const platforms: Platform[] = overrides.platforms ?? [
    {
      key: 'shopee',
      label: { vi: 'Shopee', en: 'Shopee' },
      kind: 'marketplace',
      badge: { text: 'SP', swatch: 'orange_500' },
      iconAsset: null,
      active: true,
    },
  ]
  const shops: Shop[] = overrides.shops ?? [
    {
      id: 'shop_shopee_1',
      platformKey: 'shopee',
      name: 'Shopee 1',
      handle: '@shop1',
    },
  ]
  const approvalRules: ApprovalRule[] = overrides.approvalRules ?? [
    {
      id: 'boss_sensitive',
      order: 1,
      enabled: true,
      label: { vi: 'Việc nhạy cảm', en: 'Sensitive work' },
      when: { tagsAny: ['money', 'refund'] },
      level: 'boss',
    },
  ]
  const taskTypes: TaskType[] = overrides.taskTypes ?? []

  return {
    departments,
    roles: overrides.roles ?? DEFAULT_ROLES,
    specialties,
    employees,
    shops,
    platforms,
    approvalRules,
    policy: overrides.policy ?? DEFAULT_POLICY,
    taskTypes,
    building: overrides.building ?? DEFAULT_BUILDING,
    floorTemplates: overrides.floorTemplates ?? DEFAULT_FLOOR_TEMPLATES,
    palette: overrides.palette ?? DEFAULT_PALETTE,
  }
}

export function makeState(config = makeConfig(), now = t(0)): OfficeState {
  return initialState(config, now)
}

export function makeSampleTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task_01JTEST000000000000000001',
    typeKey: 'cs.reply_review',
    title: 'Trả lời đánh giá khách hàng',
    detail: null,
    departmentId: 'dep_cs',
    assigneeId: 'emp_mai',
    requestedBy: { kind: 'manager', id: 'emp_thu' },
    channel: 'platform',
    platformKey: 'shopee',
    shopId: 'shop_shopee_1',
    amountVnd: null,
    tags: ['routine_draft'],
    priority: 'normal',
    createdAt: t(0),
    startedAt: null,
    finishedAt: null,
    status: 'queued',
    progress: 0,
    requiredLevel: 'reviewer',
    matchedRuleIds: [],
    parentTaskId: null,
    attempts: 1,
    ...overrides,
  }
}

export function makeEvent<T extends EventType>(
  type: T,
  payload: EventPayloads[T],
  overrides: Partial<Omit<OfficeEvent<T>, 'type' | 'payload'>> = {},
): OfficeEvent<T> {
  return {
    v: 1,
    id: (overrides.id ?? 'evt_01JTEST000000000000000001') as EventId,
    seq: overrides.seq ?? 1,
    at: overrides.at ?? t(1),
    type,
    actor: overrides.actor ?? { kind: 'system', id: null },
    causedBy: overrides.causedBy ?? null,
    payload,
  }
}

export function makeCommand<T extends CommandType>(
  type: T,
  payload: CommandPayloads[T],
  overrides: Partial<Omit<Command<T>, 'type' | 'payload'>> = {},
): Command<T> {
  return {
    v: 1,
    id: (overrides.id ?? 'cmd_01JTEST000000000000000001') as CommandId,
    type,
    issuedBy: overrides.issuedBy ?? { userId: 'usr_boss_1', role: 'boss' },
    issuedAt: overrides.issuedAt ?? t(1),
    payload,
  }
}

export const ev = {
  taskCreated: (task: Partial<Task> = {}, seq = 1, at = t(1)) =>
    makeEvent('task.created', { task: makeSampleTask(task) }, { seq, at }),
  personActivity: (
    employeeId: OfficeEvent<'person.activity'>['payload']['employeeId'],
    activity: OfficeEvent<'person.activity'>['payload']['activity'],
    seq = 1,
    at = t(1),
  ) => makeEvent('person.activity', { employeeId, activity }, { seq, at }),
}

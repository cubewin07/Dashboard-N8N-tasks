import { z } from 'zod'
import {
  ApprovalLevelSchema,
  DepartmentIdSchema,
  EmployeeIdSchema,
  IsoSchema,
  LabelSchema,
  ModelTierSchema,
  PrioritySchema,
  ShopIdSchema,
  type ApprovalLevel,
  type DepartmentId,
  type EmployeeId,
  type Iso,
  type Label,
  type ModelTier,
  type Priority,
  type ShopId,
} from './primitives'

const SlugSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'Expected lowercase snake_case slug')

export interface PaletteSwatch {
  key: string
  label: Label
  hex: string
  softHex: string
}

export const PaletteSwatchSchema = z.object({
  key: SlugSchema,
  label: LabelSchema,
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected #RRGGBB hex color'),
  softHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected #RRGGBB hex color'),
})

export interface Department {
  id: DepartmentId
  key: string
  label: Label
  order: number
  colorSwatch: string
  icon: string
  hours: 'office' | '24_7'
  floorTemplate: string
  active: boolean
}

export const DepartmentSchema = z.object({
  id: DepartmentIdSchema,
  key: SlugSchema,
  label: LabelSchema,
  order: z.number().int().min(0),
  colorSwatch: SlugSchema,
  icon: z.string().min(1),
  hours: z.enum(['office', '24_7']),
  floorTemplate: SlugSchema,
  active: z.boolean(),
})

export type WorkspaceKind =
  | 'private_office'
  | 'review_desk'
  | 'desk'
  | 'boss_office'
  | 'manager_office'

export const WorkspaceKindSchema = z.enum([
  'private_office',
  'review_desk',
  'desk',
  'boss_office',
  'manager_office',
])

export interface RoleDef {
  key: string
  label: Label
  scope: 'building' | 'department'
  caps: {
    assignTasks: boolean
    approveLevel: ApprovalLevel | null
    distributeReviews: boolean
    answerQuestions: boolean
    doWork: boolean
    humanOwner: boolean
  }
  modelTier: ModelTier
  maxPerDepartment: number | null
  workspace: WorkspaceKind
  sortOrder: number
}

export const RoleDefSchema = z.object({
  key: SlugSchema,
  label: LabelSchema,
  scope: z.enum(['building', 'department']),
  caps: z.object({
    assignTasks: z.boolean(),
    approveLevel: ApprovalLevelSchema.nullable(),
    distributeReviews: z.boolean(),
    answerQuestions: z.boolean(),
    doWork: z.boolean(),
    humanOwner: z.boolean(),
  }),
  modelTier: ModelTierSchema,
  maxPerDepartment: z.number().int().positive().nullable(),
  workspace: WorkspaceKindSchema,
  sortOrder: z.number().int(),
})

export interface Specialty {
  key: string
  label: Label
  icon: string
  homeDepartmentKey: string | null
}

export const SpecialtySchema = z.object({
  key: SlugSchema,
  label: LabelSchema,
  icon: z.string().min(1),
  homeDepartmentKey: SlugSchema.nullable(),
})

export interface Employee {
  id: EmployeeId
  name: string
  departmentId: DepartmentId | null
  roleKey: string
  specialties: string[]
  kind: 'core' | 'temp'
  state: 'active' | 'archived'
  reviewMode: 'always' | 'when_important'
  modelTierOverride: ModelTier | null
  bio: Label | null
  createdAt: Iso
  createdBy: 'seed' | 'boss' | 'manager'
  archivedAt: Iso | null
}

export const EmployeeSchema = z.object({
  id: EmployeeIdSchema,
  name: z.string().min(1),
  departmentId: DepartmentIdSchema.nullable(),
  roleKey: SlugSchema,
  specialties: z.array(SlugSchema),
  kind: z.enum(['core', 'temp']),
  state: z.enum(['active', 'archived']),
  reviewMode: z.enum(['always', 'when_important']),
  modelTierOverride: ModelTierSchema.nullable(),
  bio: LabelSchema.nullable(),
  createdAt: IsoSchema,
  createdBy: z.enum(['seed', 'boss', 'manager']),
  archivedAt: IsoSchema.nullable(),
})

export interface Policy {
  staffing: {
    tempCap: number
    dropOrder: 'longest_idle_first'
    minIdleMinutesBeforeDrop: number
  }
  help: {
    timeoutMinutes: number
    maxRounds: number
    escalateTo: 'dept_manager'
  }
  priority: {
    weights: Record<Priority, number>
    agingPointsPerHour: number
    agingCapPoints: number
  }
  approvals: {
    defaultLevel: ApprovalLevel
    chain: 'every_level_up_to_required' | 'required_only'
    questionSeatThreshold: number
  }
  work: {
    oneActiveTaskPerWorker: true
    maxRetries: number
    maxQuestionsPerTask: number
  }
  calendar: {
    timezone: 'Asia/Ho_Chi_Minh'
    workStart: string
    workEnd: string
    lunch: [string, string]
  }
}

const HhmmSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Expected HH:MM time')

export const PolicySchema = z.object({
  staffing: z.object({
    tempCap: z.number().int().min(0),
    dropOrder: z.literal('longest_idle_first'),
    minIdleMinutesBeforeDrop: z.number().int().min(0),
  }),
  help: z.object({
    timeoutMinutes: z.number().int().positive(),
    maxRounds: z.number().int().positive(),
    escalateTo: z.literal('dept_manager'),
  }),
  priority: z.object({
    weights: z.object({
      urgent: z.number(),
      high: z.number(),
      normal: z.number(),
      low: z.number(),
    }),
    agingPointsPerHour: z.number().min(0),
    agingCapPoints: z.number().min(0),
  }),
  approvals: z.object({
    defaultLevel: ApprovalLevelSchema,
    chain: z.enum(['every_level_up_to_required', 'required_only']),
    questionSeatThreshold: z.number().int().positive(),
  }),
  work: z.object({
    oneActiveTaskPerWorker: z.literal(true),
    maxRetries: z.number().int().min(0),
    maxQuestionsPerTask: z.number().int().min(0),
  }),
  calendar: z.object({
    timezone: z.literal('Asia/Ho_Chi_Minh'),
    workStart: HhmmSchema,
    workEnd: HhmmSchema,
    lunch: z.tuple([HhmmSchema, HhmmSchema]),
  }),
})

export interface ApprovalRule {
  id: string
  order: number
  enabled: boolean
  label: Label
  when: {
    taskTypes?: string[]
    tagsAny?: string[]
    platformsAny?: string[]
    departmentsAny?: string[]
    amountVndGte?: number
    crossDepartment?: boolean
  }
  level: ApprovalLevel
}

export const ApprovalRuleSchema = z.object({
  id: SlugSchema,
  order: z.number().int().min(0),
  enabled: z.boolean(),
  label: LabelSchema,
  when: z.object({
    taskTypes: z.array( z.string().min(1) ).optional(),
    tagsAny: z.array(SlugSchema).optional(),
    platformsAny: z.array(SlugSchema).optional(),
    departmentsAny: z.array(z.string().min(1)).optional(),
    amountVndGte: z.number().nonnegative().optional(),
    crossDepartment: z.boolean().optional(),
  }),
  level: ApprovalLevelSchema,
})

export interface Platform {
  key: string
  label: Label
  kind: 'marketplace' | 'social' | 'messaging'
  badge: { text: string; swatch: string }
  iconAsset: string | null
  active: boolean
}

export const PlatformSchema = z.object({
  key: SlugSchema,
  label: LabelSchema,
  kind: z.enum(['marketplace', 'social', 'messaging']),
  badge: z.object({
    text: z.string().min(1).max(4),
    swatch: z.string().min(1),
  }),
  iconAsset: z.string().nullable(),
  active: z.boolean(),
})

export interface Shop {
  id: ShopId
  platformKey: string
  name: string
  handle: string | null
}

export const ShopSchema = z.object({
  id: ShopIdSchema,
  platformKey: SlugSchema,
  name: z.string().min(1),
  handle: z.string().nullable(),
})

export type CarriedItem = 'document' | 'laptop' | 'phone' | 'tablet' | 'box' | 'camera'

export const CarriedItemSchema = z.enum([
  'document',
  'laptop',
  'phone',
  'tablet',
  'box',
  'camera',
])

export interface TaskType {
  key: string
  departmentKey: string
  label: Label
  specialty: string
  tags: string[]
  defaultPriority: Priority
  durationMinutes: [number, number]
  platformKeys: string[]
  needsHelpFrom: string[]
  carries: CarriedItem
}

export const TaskTypeSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_.]*$/, 'Expected task type key'),
  departmentKey: SlugSchema,
  label: LabelSchema,
  specialty: SlugSchema,
  tags: z.array(SlugSchema),
  defaultPriority: PrioritySchema,
  durationMinutes: z.tuple([z.number().positive(), z.number().positive()]),
  platformKeys: z.array(SlugSchema),
  needsHelpFrom: z.array(SlugSchema),
  carries: CarriedItemSchema,
})

export type SlotType =
  | 'desk'
  | 'review_desk'
  | 'private_office'
  | 'manager_office'
  | 'boss_desk'
  | 'pile_anchor'
  | 'waiting_seat'
  | 'elevator_door'
  | 'stairs_entry'
  | 'meeting_table'
  | 'entrance'
  | 'idle_sofa'
  | 'idle_coffee'
  | 'idle_tea_table'
  | 'idle_water'
  | 'idle_window'
  | 'idle_chat'
  | 'idle_pingpong'
  | 'idle_arcade'
  | 'idle_boardgame'
  | 'idle_karaoke'
  | 'idle_bed'
  | 'idle_massage_chair'
  | 'decor'
  | 'cat_spot'

export const SlotTypeSchema = z.enum([
  'desk',
  'review_desk',
  'private_office',
  'manager_office',
  'boss_desk',
  'pile_anchor',
  'waiting_seat',
  'elevator_door',
  'stairs_entry',
  'meeting_table',
  'entrance',
  'idle_sofa',
  'idle_coffee',
  'idle_tea_table',
  'idle_water',
  'idle_window',
  'idle_chat',
  'idle_pingpong',
  'idle_arcade',
  'idle_boardgame',
  'idle_karaoke',
  'idle_bed',
  'idle_massage_chair',
  'decor',
  'cat_spot',
])

export interface Slot {
  id: string
  type: SlotType
  x: number
  z: number
  rotY: number
  roleHint?: string
  capacity?: number
  parentSlotId?: string
  footprint?: Array<[number, number]>
  approach?: [number, number]
}

export const SlotSchema = z.object({
  id: z.string().min(1),
  type: SlotTypeSchema,
  x: z.number(),
  z: z.number(),
  rotY: z.number(),
  roleHint: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  parentSlotId: z.string().min(1).optional(),
  footprint: z.array(z.tuple([z.number().int(), z.number().int()])).min(1),
  approach: z.tuple([z.number().int(), z.number().int()]),
})

export interface Rect {
  x: number
  z: number
  w: number
  d: number
}

export const RectSchema = z.object({
  x: z.number(),
  z: z.number(),
  w: z.number().positive(),
  d: z.number().positive(),
})

export interface WallSegment {
  x1: number
  z1: number
  x2: number
  z2: number
  door?: { offset: number; width: number }
}

export const WallSegmentSchema = z.object({
  x1: z.number(),
  z1: z.number(),
  x2: z.number(),
  z2: z.number(),
  door: z
    .object({
      offset: z.number().nonnegative(),
      width: z.number().positive(),
    })
    .optional(),
})

export interface FloorTemplate {
  key: string
  size: { w: number; d: number }
  gridCell: 0.5
  fixedSlots: Slot[]
  deskArea?: {
    rect: Rect
    cluster: { cols: number; rows: number }
    spacing: number
    capacity: number
  }
  walls: WallSegment[]
}

export const FloorTemplateSchema = z.object({
  key: SlugSchema,
  size: z.object({
    w: z.number().positive(),
    d: z.number().positive(),
  }),
  gridCell: z.literal(0.5),
  fixedSlots: z.array(SlotSchema),
  deskArea: z
    .object({
      rect: RectSchema,
      cluster: z.object({
        cols: z.number().int().positive(),
        rows: z.number().int().positive(),
      }),
      spacing: z.number().positive(),
      capacity: z.number().int().positive(),
    })
    .optional(),
  walls: z.array(WallSegmentSchema),
})

export type BuildingStackEntry =
  | { kind: 'fixed'; key: 'lobby_cafe' | 'games_rest' | 'management'; template: string }
  | { kind: 'departments' }

export const BuildingStackEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fixed'),
    key: z.enum(['lobby_cafe', 'games_rest', 'management']),
    template: SlugSchema,
  }),
  z.object({
    kind: z.literal('departments'),
  }),
])

export interface BuildingConfig {
  floorHeight: 4.0
  stack: BuildingStackEntry[]
  elevator: {
    cars: number
    speedFloorsPerSec: number
    doorSeconds: number
    capacity: number
  }
}

export const BuildingConfigSchema = z.object({
  floorHeight: z.literal(4.0),
  stack: z.array(BuildingStackEntrySchema).min(1),
  elevator: z.object({
    cars: z.number().int().positive(),
    speedFloorsPerSec: z.number().positive(),
    doorSeconds: z.number().positive(),
    capacity: z.number().int().positive(),
  }),
})

export interface OrgConfig {
  departments: Department[]
  roles: RoleDef[]
  specialties: Specialty[]
  employees: Employee[]
  shops: Shop[]
  platforms: Platform[]
  approvalRules: ApprovalRule[]
  policy: Policy
  taskTypes: TaskType[]
  building: BuildingConfig
  floorTemplates: FloorTemplate[]
  palette: PaletteSwatch[]
}

export const OrgConfigSchema = z
  .object({
    departments: z.array(DepartmentSchema),
    roles: z.array(RoleDefSchema),
    specialties: z.array(SpecialtySchema),
    employees: z.array(EmployeeSchema),
    shops: z.array(ShopSchema),
    platforms: z.array(PlatformSchema),
    approvalRules: z.array(ApprovalRuleSchema),
    policy: PolicySchema,
    taskTypes: z.array(TaskTypeSchema),
    building: BuildingConfigSchema,
    floorTemplates: z.array(FloorTemplateSchema).default([]),
    palette: z.array(PaletteSwatchSchema).default([]),
  })
  .superRefine((cfg, ctx) => {
    const deptIds = new Set<string>()
    const deptKeys = new Set<string>()
    cfg.departments.forEach((d, idx) => {
      if (deptIds.has(d.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['departments', idx, 'id'],
          message: `Duplicate department id "${d.id}"`,
        })
      }
      deptIds.add(d.id)
      if (deptKeys.has(d.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['departments', idx, 'key'],
          message: `Duplicate department key "${d.key}"`,
        })
      }
      deptKeys.add(d.key)
    })

    const roleMap = new Map<string, RoleDef>()
    cfg.roles.forEach((r, idx) => {
      if (roleMap.has(r.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['roles', idx, 'key'],
          message: `Duplicate role key "${r.key}"`,
        })
      }
      roleMap.set(r.key, r)
    })

    const specialtyKeys = new Set<string>()
    cfg.specialties.forEach((s, idx) => {
      if (specialtyKeys.has(s.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['specialties', idx, 'key'],
          message: `Duplicate specialty key "${s.key}"`,
        })
      }
      specialtyKeys.add(s.key)
      if (s.homeDepartmentKey !== null && !deptKeys.has(s.homeDepartmentKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['specialties', idx, 'homeDepartmentKey'],
          message: `Unknown homeDepartmentKey "${s.homeDepartmentKey}" on specialty "${s.key}"`,
        })
      }
    })

    const platformKeys = new Set<string>()
    cfg.platforms.forEach((p, idx) => {
      if (platformKeys.has(p.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['platforms', idx, 'key'],
          message: `Duplicate platform key "${p.key}"`,
        })
      }
      platformKeys.add(p.key)
    })

    const shopIds = new Set<string>()
    cfg.shops.forEach((s, idx) => {
      if (shopIds.has(s.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['shops', idx, 'id'],
          message: `Duplicate shop id "${s.id}"`,
        })
      }
      shopIds.add(s.id)
      if (!platformKeys.has(s.platformKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['shops', idx, 'platformKey'],
          message: `Unknown platformKey "${s.platformKey}" on shop "${s.id}"`,
        })
      }
    })

    const empIds = new Set<string>()
    const deptRoleCounts = new Map<string, number>()

    cfg.employees.forEach((e, idx) => {
      if (empIds.has(e.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['employees', idx, 'id'],
          message: `Duplicate employee id "${e.id}"`,
        })
      }
      empIds.add(e.id)

      const role = roleMap.get(e.roleKey)
      if (!role) {
        ctx.addIssue({
          code: 'custom',
          path: ['employees', idx, 'roleKey'],
          message: `Unknown roleKey "${e.roleKey}" on employee "${e.id}"`,
        })
      } else {
        if (role.scope === 'department' && e.departmentId === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['employees', idx, 'departmentId'],
            message: `Department-scoped role "${e.roleKey}" requires a departmentId on employee "${e.id}"`,
          })
        }
        if (role.scope === 'building' && e.departmentId !== null) {
          ctx.addIssue({
            code: 'custom',
            path: ['employees', idx, 'departmentId'],
            message: `Building-scoped role "${e.roleKey}" must have departmentId = null on employee "${e.id}"`,
          })
        }
      }

      if (e.departmentId !== null && !deptIds.has(e.departmentId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['employees', idx, 'departmentId'],
          message: `Unknown departmentId "${e.departmentId}" on employee "${e.id}"`,
        })
      }

      e.specialties.forEach((spec, sIdx) => {
        if (!specialtyKeys.has(spec)) {
          ctx.addIssue({
            code: 'custom',
            path: ['employees', idx, 'specialties', sIdx],
            message: `Unknown specialty "${spec}" on employee "${e.id}"`,
          })
        }
      })

      if (e.state === 'active' && e.departmentId !== null && role && role.maxPerDepartment !== null) {
        const key = `${e.departmentId}::${role.key}`
        const nextCount = (deptRoleCounts.get(key) ?? 0) + 1
        deptRoleCounts.set(key, nextCount)
        if (nextCount > role.maxPerDepartment) {
          ctx.addIssue({
            code: 'custom',
            path: ['employees', idx, 'roleKey'],
            message: `Role "${role.key}" exceeds maxPerDepartment (${role.maxPerDepartment}) in department "${e.departmentId}"`,
          })
        }
      }
    })

    const taskTypeKeys = new Set<string>()
    cfg.taskTypes.forEach((tt, idx) => {
      if (taskTypeKeys.has(tt.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['taskTypes', idx, 'key'],
          message: `Duplicate taskType key "${tt.key}"`,
        })
      }
      taskTypeKeys.add(tt.key)
      if (!deptKeys.has(tt.departmentKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['taskTypes', idx, 'departmentKey'],
          message: `Unknown departmentKey "${tt.departmentKey}" on taskType "${tt.key}"`,
        })
      }
      if (!specialtyKeys.has(tt.specialty)) {
        ctx.addIssue({
          code: 'custom',
          path: ['taskTypes', idx, 'specialty'],
          message: `Unknown specialty "${tt.specialty}" on taskType "${tt.key}"`,
        })
      }
      tt.platformKeys.forEach((pk, pIdx) => {
        if (!platformKeys.has(pk)) {
          ctx.addIssue({
            code: 'custom',
            path: ['taskTypes', idx, 'platformKeys', pIdx],
            message: `Unknown platformKey "${pk}" on taskType "${tt.key}"`,
          })
        }
      })
      tt.needsHelpFrom.forEach((hk, hIdx) => {
        if (!specialtyKeys.has(hk)) {
          ctx.addIssue({
            code: 'custom',
            path: ['taskTypes', idx, 'needsHelpFrom', hIdx],
            message: `Unknown specialty "${hk}" in needsHelpFrom on taskType "${tt.key}"`,
          })
        }
      })
    })

    const ruleIds = new Set<string>()
    cfg.approvalRules.forEach((r, idx) => {
      if (ruleIds.has(r.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['approvalRules', idx, 'id'],
          message: `Duplicate approvalRule id "${r.id}"`,
        })
      }
      ruleIds.add(r.id)
      r.when.platformsAny?.forEach((pk, pIdx) => {
        if (!platformKeys.has(pk)) {
          ctx.addIssue({
            code: 'custom',
            path: ['approvalRules', idx, 'when', 'platformsAny', pIdx],
            message: `Unknown platformKey "${pk}" in approvalRule "${r.id}"`,
          })
        }
      })
      r.when.departmentsAny?.forEach((dk, dIdx) => {
        if (!deptKeys.has(dk) && !deptIds.has(dk)) {
          ctx.addIssue({
            code: 'custom',
            path: ['approvalRules', idx, 'when', 'departmentsAny', dIdx],
            message: `Unknown department "${dk}" in approvalRule "${r.id}"`,
          })
        }
      })
      if (cfg.taskTypes.length > 0) {
        r.when.taskTypes?.forEach((tk, tIdx) => {
          if (!taskTypeKeys.has(tk)) {
            ctx.addIssue({
              code: 'custom',
              path: ['approvalRules', idx, 'when', 'taskTypes', tIdx],
              message: `Unknown taskType "${tk}" in approvalRule "${r.id}"`,
            })
          }
        })
      }
    })

    const requiredTemplateKeys = [
      'department',
      'lobby_cafe',
      'games_rest',
      'management',
      'boss',
    ] as const
    const tplKeys = new Set<string>()
    cfg.floorTemplates.forEach((tpl, tIdx) => {
      if (tplKeys.has(tpl.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['floorTemplates', tIdx, 'key'],
          message: `Duplicate floorTemplate key "${tpl.key}"`,
        })
      }
      tplKeys.add(tpl.key)

      const slotIds = new Set<string>()
      tpl.fixedSlots.forEach((slot, sIdx) => {
        if (slotIds.has(slot.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['floorTemplates', tIdx, 'fixedSlots', sIdx, 'id'],
            message: `Duplicate slot id "${slot.id}" in template "${tpl.key}"`,
          })
        }
        slotIds.add(slot.id)

        if (slot.x < 0 || slot.x > tpl.size.w || slot.z < 0 || slot.z > tpl.size.d) {
          ctx.addIssue({
            code: 'custom',
            path: ['floorTemplates', tIdx, 'fixedSlots', sIdx],
            message: `Slot "${slot.id}" at (${slot.x}, ${slot.z}) is outside template "${tpl.key}" bounds [0..${tpl.size.w}]×[0..${tpl.size.d}]`,
          })
        }

        for (let prevIdx = 0; prevIdx < sIdx; prevIdx += 1) {
          const prev = tpl.fixedSlots[prevIdx]
          if (!prev) continue
          const dist = Math.hypot(slot.x - prev.x, slot.z - prev.z)
          if (dist < 0.4) {
            ctx.addIssue({
              code: 'custom',
              path: ['floorTemplates', tIdx, 'fixedSlots', sIdx],
              message: `Slot "${slot.id}" in template "${tpl.key}" is within 0.4m (${dist.toFixed(2)}m) of slot "${prev.id}"`,
            })
          }
        }
      })

      tpl.walls.forEach((wall, wIdx) => {
        if (wall.door && wall.door.width < tpl.gridCell * 2) {
          ctx.addIssue({
            code: 'custom',
            path: ['floorTemplates', tIdx, 'walls', wIdx, 'door', 'width'],
            message: `Door width (${wall.door.width}m) in template "${tpl.key}" must be at least 2 grid cells (${tpl.gridCell * 2}m)`,
          })
        }
      })

      const elevatorDoors = tpl.fixedSlots.filter((s) => s.type === 'elevator_door')
      if (elevatorDoors.length < cfg.building.elevator.cars) {
        ctx.addIssue({
          code: 'custom',
          path: ['floorTemplates', tIdx, 'fixedSlots'],
          message: `Template "${tpl.key}" has ${elevatorDoors.length} elevator_door slots, but building requires at least ${cfg.building.elevator.cars}`,
        })
      }

      const stairsEntries = tpl.fixedSlots.filter((s) => s.type === 'stairs_entry')
      if (stairsEntries.length < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['floorTemplates', tIdx, 'fixedSlots'],
          message: `Template "${tpl.key}" must have at least 1 stairs_entry slot`,
        })
      }

      if (tpl.key === 'lobby_cafe' && !tpl.fixedSlots.some((s) => s.type === 'entrance')) {
        ctx.addIssue({
          code: 'custom',
          path: ['floorTemplates', tIdx, 'fixedSlots'],
          message: `Template "lobby_cafe" must have at least 1 entrance slot`,
        })
      }

      if (tpl.key === 'boss' && !tpl.fixedSlots.some((s) => s.type === 'boss_desk')) {
        ctx.addIssue({
          code: 'custom',
          path: ['floorTemplates', tIdx, 'fixedSlots'],
          message: `Template "boss" must have at least 1 boss_desk slot`,
        })
      }
    })

    for (const reqKey of requiredTemplateKeys) {
      if (!tplKeys.has(reqKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['floorTemplates'],
          message: `Missing required floorTemplate "${reqKey}"`,
        })
      }
    }

    if (cfg.floorTemplates.length > 1) {
      const formatCoordList = (slots: Slot[]) =>
        slots
          .map((s) => `${s.x.toFixed(3)},${s.z.toFixed(3)}`)
          .sort()
          .join('|')

      const baseTpl = cfg.floorTemplates[0]!
      const baseElevators = formatCoordList(
        baseTpl.fixedSlots.filter((s) => s.type === 'elevator_door'),
      )
      const baseStairs = formatCoordList(
        baseTpl.fixedSlots.filter((s) => s.type === 'stairs_entry'),
      )

      cfg.floorTemplates.forEach((tpl, tIdx) => {
        if (tIdx === 0) return
        const elev = formatCoordList(tpl.fixedSlots.filter((s) => s.type === 'elevator_door'))
        if (elev !== baseElevators) {
          ctx.addIssue({
            code: 'custom',
            path: ['floorTemplates', tIdx, 'fixedSlots'],
            message: `Template "${tpl.key}" elevator_door (x, z) coordinates (${elev}) do not match "${baseTpl.key}" (${baseElevators})`,
          })
        }
        const stairs = formatCoordList(tpl.fixedSlots.filter((s) => s.type === 'stairs_entry'))
        if (stairs !== baseStairs) {
          ctx.addIssue({
            code: 'custom',
            path: ['floorTemplates', tIdx, 'fixedSlots'],
            message: `Template "${tpl.key}" stairs_entry (x, z) coordinates (${stairs}) do not match "${baseTpl.key}" (${baseStairs})`,
          })
        }
      })
    }

    cfg.departments.forEach((d, idx) => {
      if (!tplKeys.has(d.floorTemplate)) {
        ctx.addIssue({
          code: 'custom',
          path: ['departments', idx, 'floorTemplate'],
          message: `Unknown floorTemplate "${d.floorTemplate}" on department "${d.key}"`,
        })
      }
    })
    cfg.building.stack.forEach((entry, idx) => {
      if (entry.kind === 'fixed' && !tplKeys.has(entry.template)) {
        ctx.addIssue({
          code: 'custom',
          path: ['building', 'stack', idx, 'template'],
          message: `Unknown floorTemplate "${entry.template}" in building stack`,
        })
      }
    })

    if (cfg.palette.length > 0) {
      const swatchKeys = new Set(cfg.palette.map((s) => s.key))
      cfg.departments.forEach((d, idx) => {
        if (!swatchKeys.has(d.colorSwatch)) {
          ctx.addIssue({
            code: 'custom',
            path: ['departments', idx, 'colorSwatch'],
            message: `Unknown colorSwatch "${d.colorSwatch}" on department "${d.key}"`,
          })
        }
      })
    }
  })

export function parseOrgConfig(raw: unknown): OrgConfig {
  const res = OrgConfigSchema.safeParse(raw)
  if (!res.success) {
    const details = res.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid OrgConfig:\n${details}`)
  }
  return res.data
}

export type ConfigChange =
  | { kind: 'department.upsert'; department: Department }
  | { kind: 'department.reorder'; ids: string[] }
  | { kind: 'role.upsert'; role: RoleDef }
  | { kind: 'role.delete'; key: string }
  | { kind: 'specialty.upsert'; specialty: Specialty }
  | { kind: 'specialty.delete'; key: string }
  | { kind: 'employee.upsert'; employee: Employee }
  | { kind: 'employee.archive'; id: string; reason: 'dismissed' | 'cap' }
  | { kind: 'employee.restore'; id: string }
  | { kind: 'policy.set'; policy: Policy }
  | { kind: 'rule.upsert'; rule: ApprovalRule }
  | { kind: 'rule.delete'; id: string }
  | { kind: 'rule.reorder'; ids: string[] }
  | { kind: 'platform.upsert'; platform: Platform }
  | { kind: 'shop.upsert'; shop: Shop }
  | { kind: 'taskType.upsert'; taskType: TaskType }
  | { kind: 'config.replace'; config: OrgConfig }

export const ConfigChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('department.upsert'), department: DepartmentSchema }),
  z.object({ kind: z.literal('department.reorder'), ids: z.array(z.string()) }),
  z.object({ kind: z.literal('role.upsert'), role: RoleDefSchema }),
  z.object({ kind: z.literal('role.delete'), key: SlugSchema }),
  z.object({ kind: z.literal('specialty.upsert'), specialty: SpecialtySchema }),
  z.object({ kind: z.literal('specialty.delete'), key: SlugSchema }),
  z.object({ kind: z.literal('employee.upsert'), employee: EmployeeSchema }),
  z.object({
    kind: z.literal('employee.archive'),
    id: EmployeeIdSchema,
    reason: z.enum(['dismissed', 'cap']),
  }),
  z.object({ kind: z.literal('employee.restore'), id: EmployeeIdSchema }),
  z.object({ kind: z.literal('policy.set'), policy: PolicySchema }),
  z.object({ kind: z.literal('rule.upsert'), rule: ApprovalRuleSchema }),
  z.object({ kind: z.literal('rule.delete'), id: SlugSchema }),
  z.object({ kind: z.literal('rule.reorder'), ids: z.array(z.string()) }),
  z.object({ kind: z.literal('platform.upsert'), platform: PlatformSchema }),
  z.object({ kind: z.literal('shop.upsert'), shop: ShopSchema }),
  z.object({ kind: z.literal('taskType.upsert'), taskType: TaskTypeSchema }),
  z.object({ kind: z.literal('config.replace'), config: OrgConfigSchema }),
])

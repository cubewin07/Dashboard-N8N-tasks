import type { Department, FloorTemplate, OrgConfig, RoleDef, Slot } from '@/domain/config'
import type { DepartmentId, EmployeeId, Label } from '@/domain/primitives'
import { allocateSeats } from './allocate'
import { buildFloorSlots } from './floorLayout'
import { buildTemplateMap, getFloorTemplate } from './templates'
import type { BuildingLayout, FloorKind, FloorLayout } from './types'

const FIXED_FLOOR_META: Record<
  'lobby_cafe' | 'games_rest' | 'management' | 'boss',
  { label: Label; colorSwatch: string }
> = {
  lobby_cafe: {
    label: { vi: 'Sảnh & Quán cà phê', en: 'Lobby & Cafe' },
    colorSwatch: 'leisure',
  },
  games_rest: {
    label: { vi: 'Giải trí & Nghỉ ngơi', en: 'Games & Rest' },
    colorSwatch: 'leisure',
  },
  management: {
    label: { vi: 'Điều hành', en: 'Management' },
    colorSwatch: 'management',
  },
  boss: {
    label: { vi: 'Tầng Giám đốc', en: 'Executive Floor' },
    colorSwatch: 'boss',
  },
}

function compareDepartments(a: Department, b: Department): number {
  if (a.order !== b.order) {
    return a.order - b.order
  }
  return a.key.localeCompare(b.key)
}

function countDepartmentDeskNeed(
  config: OrgConfig,
  deptId: DepartmentId,
  roleByKey: ReadonlyMap<string, RoleDef>,
  template: FloorTemplate,
): number {
  let deskCount = 0
  let reviewCount = 0

  for (const emp of config.employees) {
    if (emp.state !== 'active' || emp.departmentId !== deptId) {
      continue
    }
    const role = roleByKey.get(emp.roleKey)
    if (!role) {
      continue
    }
    if (role.workspace === 'desk') {
      deskCount += 1
    } else if (role.workspace === 'review_desk') {
      reviewCount += 1
    }
  }

  const mainReviewCapacity = template.fixedSlots.filter((s) => s.type === 'review_desk').length
  const reviewOverflow = Math.max(0, reviewCount - mainReviewCapacity)
  return deskCount + reviewOverflow
}

function makeFloorLayout(params: {
  index: number
  key: string
  kind: FloorKind
  departmentId: DepartmentId | null
  annexIndex: number
  label: Label
  colorSwatch: string
  floorHeight: number
  template: FloorTemplate
  deskPeopleCount: number
}): FloorLayout {
  const {
    index,
    key,
    kind,
    departmentId,
    annexIndex,
    label,
    colorSwatch,
    floorHeight,
    template,
    deskPeopleCount,
  } = params

  const slots: Slot[] = buildFloorSlots(template, deskPeopleCount, annexIndex)
  const elevatorDoorSlots = slots.filter((s) => s.type === 'elevator_door')
  const stairsEntrySlot = slots.find((s) => s.type === 'stairs_entry')
  if (!stairsEntrySlot) {
    throw new Error(`Template "${template.key}" is missing a stairs_entry slot`)
  }

  return {
    index,
    key,
    kind,
    departmentId,
    annexIndex,
    label: { vi: label.vi, en: label.en },
    colorSwatch,
    y: index * floorHeight,
    size: { w: template.size.w, d: template.size.d, h: floorHeight },
    templateKey: template.key,
    slots,
    walls: template.walls.map((w) => ({
      ...w,
      ...(w.door ? { door: { ...w.door } } : {}),
    })),
    elevatorDoorSlots,
    stairsEntrySlot,
    occupants: {},
  }
}

/**
 * `previous` is the layout this one replaces: seats are kept where possible,
 * so hiring somebody does not reshuffle the people already sitting.
 */
export function buildBuildingLayout(
  config: OrgConfig,
  previous?: Pick<BuildingLayout, 'seatOf'> | null,
): BuildingLayout {
  const templateMap = buildTemplateMap(config.floorTemplates)
  const roleByKey = new Map<string, RoleDef>()
  for (const role of config.roles) {
    roleByKey.set(role.key, role)
  }

  const floorHeight = config.building.floorHeight
  const floors: FloorLayout[] = []
  const emittedFixedKeys = new Set<string>()

  for (const entry of config.building.stack) {
    if (entry.kind === 'fixed') {
      const rawKey = String(entry.key)
      if (rawKey === 'boss' || entry.template === 'boss') {
        continue
      }
      if (emittedFixedKeys.has(rawKey)) {
        continue
      }
      emittedFixedKeys.add(rawKey)

      const meta = FIXED_FLOOR_META[entry.key]
      const tpl = getFloorTemplate(templateMap, entry.template)
      floors.push(
        makeFloorLayout({
          index: floors.length,
          key: entry.key,
          kind: entry.key,
          departmentId: null,
          annexIndex: 0,
          label: meta.label,
          colorSwatch: meta.colorSwatch,
          floorHeight,
          template: tpl,
          deskPeopleCount: 0,
        }),
      )
      continue
    }

    if (entry.kind === 'departments') {
      const activeDepts = config.departments
        .filter((d) => d.active)
        .slice()
        .sort(compareDepartments)

      for (const dept of activeDepts) {
        const tpl = getFloorTemplate(templateMap, dept.floorTemplate)
        const capacity = tpl.deskArea?.capacity ?? 16
        const totalDeskNeed = countDepartmentDeskNeed(config, dept.id, roleByKey, tpl)
        const floorCount = Math.max(1, Math.ceil(totalDeskNeed / capacity))

        for (let k = 0; k < floorCount; k += 1) {
          const remaining = Math.max(0, totalDeskNeed - k * capacity)
          const deskPeopleCount = Math.min(capacity, remaining)
          const floorKey = k === 0 ? dept.key : `${dept.key}#${k + 1}`
          const floorLabel: Label =
            k === 0
              ? dept.label
              : {
                  vi: `${dept.label.vi} (${k + 1})`,
                  en: `${dept.label.en} (${k + 1})`,
                }

          floors.push(
            makeFloorLayout({
              index: floors.length,
              key: floorKey,
              kind: 'department',
              departmentId: dept.id,
              annexIndex: k,
              label: floorLabel,
              colorSwatch: dept.colorSwatch,
              floorHeight,
              template: tpl,
              deskPeopleCount,
            }),
          )
        }
      }
    }
  }

  const bossMeta = FIXED_FLOOR_META.boss
  const bossTpl = getFloorTemplate(templateMap, 'boss')
  floors.push(
    makeFloorLayout({
      index: floors.length,
      key: 'boss',
      kind: 'boss',
      departmentId: null,
      annexIndex: 0,
      label: bossMeta.label,
      colorSwatch: bossMeta.colorSwatch,
      floorHeight,
      template: bossTpl,
      deskPeopleCount: 0,
    }),
  )

  const seatAssignments = allocateSeats(config, floors, previous?.seatOf)
  const byKey: Record<string, number> = {}
  for (const f of floors) {
    byKey[f.key] = f.index
  }
  for (const [empId, seat] of Object.entries(seatAssignments)) {
    const floorIdx = byKey[seat.floorKey]
    if (floorIdx !== undefined && floors[floorIdx]) {
      floors[floorIdx]!.occupants[seat.slotId] = empId as EmployeeId
    }
  }

  const totalHeight = floors.length * floorHeight
  const maxW = floors.reduce((acc, f) => Math.max(acc, f.size.w), 0)
  const maxD = floors.reduce((acc, f) => Math.max(acc, f.size.d), 0)

  const firstFloor = floors[0]!
  const elevDoors = firstFloor.elevatorDoorSlots
  const elevX =
    elevDoors.reduce((sum, s) => sum + s.x, 0) / Math.max(1, elevDoors.length)
  const elevZ =
    elevDoors.reduce((sum, s) => sum + s.z, 0) / Math.max(1, elevDoors.length)
  const stairsSlot = firstFloor.stairsEntrySlot

  return {
    floors,
    floorHeight,
    totalHeight,
    footprint: { w: maxW, d: maxD },
    bounds: {
      min: [0, 0, 0],
      max: [maxW, totalHeight, maxD],
    },
    shafts: {
      elevator: {
        x: elevX,
        z: elevZ,
        cars: config.building.elevator.cars,
      },
      stairs: {
        x: stairsSlot.x,
        z: stairsSlot.z,
      },
    },
    byKey,
    seatOf: seatAssignments,
    seatAssignments,
    elevatorCarCount: config.building.elevator.cars,
  }
}

export const computeBuildingLayout = buildBuildingLayout

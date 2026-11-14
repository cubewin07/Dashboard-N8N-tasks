import type { Department, Employee, OrgConfig, RoleDef, Specialty } from './config'
import type { DepartmentId, Label } from './primitives'

export interface OrgPersonNode {
  employee: Employee
  role: RoleDef
  specialties: Specialty[]
}

export interface OrgFloorNode {
  floorKey: string
  floorNumber: number
  kind: 'boss' | 'management' | 'department'
  label: Label
  colorSwatch: string
  hours: 'office' | '24_7'
  department: Department | null
  people: OrgPersonNode[]
}

const BOSS_FLOOR_LABEL: Label = {
  vi: 'Phòng Giám đốc',
  en: 'Executive Suite',
}

const MANAGEMENT_FLOOR_LABEL: Label = {
  vi: 'Điều hành & Quản lý',
  en: 'Management Office',
}

export function sortEmployeesByRole(
  employees: Employee[],
  roleMap: ReadonlyMap<string, RoleDef>,
): Employee[] {
  return [...employees].sort((a, b) => {
    const orderA = roleMap.get(a.roleKey)?.sortOrder ?? 999
    const orderB = roleMap.get(b.roleKey)?.sortOrder ?? 999
    if (orderA !== orderB) return orderA - orderB
    const createdCmp = a.createdAt.localeCompare(b.createdAt)
    if (createdCmp !== 0) return createdCmp
    return a.id.localeCompare(b.id)
  })
}

export function peopleByDepartment(
  config: OrgConfig,
): Record<DepartmentId | 'building', Employee[]> {
  const roleMap = new Map(config.roles.map((r) => [r.key, r]))
  const grouped: Record<string, Employee[]> = { building: [] }

  for (const dept of config.departments) {
    grouped[dept.id] = []
  }

  for (const emp of config.employees) {
    if (emp.state !== 'active') continue
    const key = emp.departmentId ?? 'building'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(emp)
  }

  for (const key of Object.keys(grouped)) {
    grouped[key] = sortEmployeesByRole(grouped[key], roleMap)
  }

  return grouped as Record<DepartmentId | 'building', Employee[]>
}

/**
 * Builds the company organisation tree ordered top floor -> bottom floor
 * (Boss floor first, then Management, then active departments in reverse floor order).
 */
export function orgTree(config: OrgConfig): OrgFloorNode[] {
  const roleMap = new Map(config.roles.map((r) => [r.key, r]))
  const specialtyMap = new Map(config.specialties.map((s) => [s.key, s]))
  const activeDeptsAsc = [...config.departments]
    .filter((d) => d.active)
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))

  const toPersonNode = (emp: Employee): OrgPersonNode => {
    const role = roleMap.get(emp.roleKey) ?? {
      key: emp.roleKey,
      label: { vi: emp.roleKey, en: emp.roleKey },
      scope: emp.departmentId ? 'department' : 'building',
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
      sortOrder: 999,
    }
    const specialties = emp.specialties
      .map((sKey) => specialtyMap.get(sKey))
      .filter((s): s is Specialty => s !== undefined)
    return { employee: emp, role, specialties }
  }

  // Expand building stack bottom -> top to compute exact floor numbers.
  type RawFloor =
    | { kind: 'fixed'; key: 'lobby_cafe' | 'games_rest' | 'management' }
    | { kind: 'department'; department: Department }
    | { kind: 'boss' }

  const bottomUp: RawFloor[] = []
  for (const entry of config.building.stack) {
    if (entry.kind === 'fixed') {
      bottomUp.push({ kind: 'fixed', key: entry.key })
    } else if (entry.kind === 'departments') {
      for (const dept of activeDeptsAsc) {
        bottomUp.push({ kind: 'department', department: dept })
      }
    }
  }
  bottomUp.push({ kind: 'boss' })

  const byDept = peopleByDepartment(config)
  const buildingPeople = byDept.building ?? []

  const ownerPeople = buildingPeople
    .filter((e) => roleMap.get(e.roleKey)?.caps.humanOwner === true)
    .map(toPersonNode)
  const managerPeople = buildingPeople
    .filter((e) => roleMap.get(e.roleKey)?.caps.humanOwner !== true)
    .map(toPersonNode)

  const floorsBottomUp: OrgFloorNode[] = []
  bottomUp.forEach((raw, idx) => {
    const floorNumber = idx + 1
    if (raw.kind === 'boss') {
      floorsBottomUp.push({
        floorKey: 'boss',
        floorNumber,
        kind: 'boss',
        label: BOSS_FLOOR_LABEL,
        colorSwatch: 'boss',
        hours: 'office',
        department: null,
        people: ownerPeople,
      })
    } else if (raw.kind === 'fixed' && raw.key === 'management') {
      floorsBottomUp.push({
        floorKey: 'management',
        floorNumber,
        kind: 'management',
        label: MANAGEMENT_FLOOR_LABEL,
        colorSwatch: 'management',
        hours: 'office',
        department: null,
        people: managerPeople,
      })
    } else if (raw.kind === 'department') {
      const dept = raw.department
      const people = (byDept[dept.id] ?? []).map(toPersonNode)
      floorsBottomUp.push({
        floorKey: dept.key,
        floorNumber,
        kind: 'department',
        label: dept.label,
        colorSwatch: dept.colorSwatch,
        hours: dept.hours,
        department: dept,
        people,
      })
    }
  })

  return floorsBottomUp.reverse()
}

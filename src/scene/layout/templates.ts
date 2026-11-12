import bossJson from '@/content/floor-templates/boss.json'
import departmentJson from '@/content/floor-templates/department.json'
import gamesRestJson from '@/content/floor-templates/games_rest.json'
import lobbyCafeJson from '@/content/floor-templates/lobby_cafe.json'
import managementJson from '@/content/floor-templates/management.json'
import { FloorTemplateSchema, type FloorTemplate } from '@/domain/config'
import type { FloorTemplateMap } from './types'

const BUNDLED_TEMPLATES: FloorTemplate[] = [
  FloorTemplateSchema.parse(bossJson),
  FloorTemplateSchema.parse(departmentJson),
  FloorTemplateSchema.parse(gamesRestJson),
  FloorTemplateSchema.parse(lobbyCafeJson),
  FloorTemplateSchema.parse(managementJson),
]

export function buildTemplateMap(templates: readonly FloorTemplate[]): FloorTemplateMap {
  const map = new Map<string, FloorTemplate>()
  for (const tpl of BUNDLED_TEMPLATES) {
    map.set(tpl.key, tpl)
  }
  for (const tpl of templates) {
    map.set(tpl.key, tpl)
  }
  return map
}

export function getFloorTemplate(map: FloorTemplateMap, key: string): FloorTemplate {
  const found = map.get(key)
  if (!found) {
    throw new Error(`Unknown floor template "${key}"`)
  }
  return found
}

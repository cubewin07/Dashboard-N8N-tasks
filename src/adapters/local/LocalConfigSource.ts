import { z } from 'zod'
import approvalRules from '@/content/approval-rules.json'
import building from '@/content/building.json'
import bossTemplate from '@/content/floor-templates/boss.json'
import departmentTemplate from '@/content/floor-templates/department.json'
import gamesRestTemplate from '@/content/floor-templates/games_rest.json'
import lobbyCafeTemplate from '@/content/floor-templates/lobby_cafe.json'
import managementTemplate from '@/content/floor-templates/management.json'
import orgSeed from '@/content/org.seed.json'
import palette from '@/content/palette.json'
import platforms from '@/content/platforms.json'
import policy from '@/content/policy.json'
import roles from '@/content/roles.json'
import specialties from '@/content/specialties.json'
import taskTypes from '@/content/task-types.json'
import { parseOrgConfig, type ConfigChange, type OrgConfig } from '@/domain/config'
import type { ConfigSource } from '@/ports/ConfigSource'

export const CONFIG_OVERRIDES_KEY = 'office.config.overrides'

export class ConfigError extends Error {
  readonly code: string
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.name = 'ConfigError'
    this.code = code
  }
}

const OverrideEnvelopeSchema = z.object({
  v: z.literal(1),
  patch: z.record(z.string(), z.unknown()),
})

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [key, patchVal] of Object.entries(patch)) {
    const baseVal = out[key]
    if (isPlainObject(baseVal) && isPlainObject(patchVal)) {
      out[key] = deepMerge(baseVal, patchVal)
    } else {
      out[key] = patchVal
    }
  }
  return out
}

export function getBundledRawConfig(): Record<string, unknown> {
  return {
    departments: orgSeed.departments,
    employees: orgSeed.employees,
    shops: orgSeed.shops,
    roles,
    specialties,
    platforms,
    approvalRules,
    policy,
    taskTypes,
    building,
    floorTemplates: [
      bossTemplate,
      departmentTemplate,
      gamesRestTemplate,
      lobbyCafeTemplate,
      managementTemplate,
    ],
    palette,
  }
}

export class LocalConfigSource implements ConfigSource {
  private readonly listeners = new Set<(cfg: OrgConfig) => void>()

  async load(): Promise<OrgConfig> {
    const bundledRaw = getBundledRawConfig()
    const baseConfig = parseOrgConfig(bundledRaw)

    let rawOverride: string | null = null
    try {
      if (typeof localStorage !== 'undefined') {
        rawOverride = localStorage.getItem(CONFIG_OVERRIDES_KEY)
      }
    } catch {
      rawOverride = null
    }

    if (!rawOverride) {
      return baseConfig
    }

    try {
      const parsedJson: unknown = JSON.parse(rawOverride)
      const env = OverrideEnvelopeSchema.parse(parsedJson)
      const merged = deepMerge(bundledRaw, env.patch)
      return parseOrgConfig(merged)
    } catch (err) {
      console.warn('Ignoring invalid office.config.overrides in localStorage:', err)
      return baseConfig
    }
  }

  subscribe(cb: (cfg: OrgConfig) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  async apply(_change: ConfigChange): Promise<void> {
    void _change
    throw new ConfigError('not_implemented', 'Config writes are implemented in P10')
  }
}

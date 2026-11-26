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
import type { ConfigAuditEntry } from '@/domain/configChange'
import { ConfigError, type ConfigActor, type ConfigSource } from '@/ports/ConfigSource'

export { ConfigError }

export const CONFIG_OVERRIDES_KEY = 'office.config.overrides'

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

export interface LocalConfigSourceOptions {
  /** The signed-in user, for the role check (R15) and history rows. */
  getActor?: () => ConfigActor | null
}

export class LocalConfigSource implements ConfigSource {
  private readonly listeners = new Set<(cfg: OrgConfig) => void>()
  private readonly getActor: () => ConfigActor | null

  constructor(options: LocalConfigSourceOptions = {}) {
    this.getActor = options.getActor ?? (() => null)
  }

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
    void this.getActor
    throw new ConfigError('unknown', 'TODO(P10-T03)')
  }

  async history(_limit = 200): Promise<ConfigAuditEntry[]> {
    void _limit
    return [] // TODO(P10-T03): local ring buffer
  }
}

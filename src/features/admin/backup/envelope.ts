// P10-T15 · The export file and how an import is read back. Pure: no React, no clock.
import { formatInTimeZone } from 'date-fns-tz'
import { OrgConfigSchema, type OrgConfig } from '@/domain/config'
import { applyConfigChange } from '@/domain/configChange'
import type { Iso } from '@/domain/primitives'
import { hasErrors, validateConfig, type ConfigIssue } from '@/domain/validateConfig'
import { TZ } from '@/lib/time'

export const CONFIG_FORMAT = 'ai-office-config'
/** Bump when the file layout changes in a way an older app cannot read. */
export const CONFIG_FILE_VERSION = 1

/**
 * Ruling: the export is an envelope `{format, version, exportedAt, config}` around the FULL
 * OrgConfig. The envelope lets import tell "not our file" and "from a newer app" apart from
 * "our file with a broken config"; the full config keeps the file self-contained and valid on
 * its own. `parseImport` also accepts a bare config object.
 */
export interface ConfigFile {
  format: typeof CONFIG_FORMAT
  version: number
  exportedAt: Iso
  config: OrgConfig
}

export function buildConfigFile(config: OrgConfig, exportedAt: Iso): ConfigFile {
  return { format: CONFIG_FORMAT, version: CONFIG_FILE_VERSION, exportedAt, config }
}

/** Pretty-printed, trailing newline. */
export function serializeConfigFile(config: OrgConfig, exportedAt: Iso): string {
  return `${JSON.stringify(buildConfigFile(config, exportedAt), null, 2)}\n`
}

/** `ai-office-config-YYYY-MM-DD.json`, the date as the boss sees it (Asia/Ho_Chi_Minh). */
export function exportFileName(exportedAt: Iso): string {
  return `ai-office-config-${formatInTimeZone(exportedAt, TZ, 'yyyy-MM-dd')}.json`
}

export type ImportResult =
  | { ok: true; config: OrgConfig; merged: OrgConfig; issues: ConfigIssue[] }
  | {
      ok: false
      reason: 'not_json' | 'not_config' | 'newer_version' | 'invalid'
      issues: ConfigIssue[]
      version?: number
    }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Read an import file against the current config.
 * `config` is what the file says; `merged` is what `config.replace` would produce (editable
 * parts from the file, building / floor templates / palette kept), already validated.
 * Any error means nothing may be applied.
 */
export function parseImport(text: string, current: OrgConfig): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'not_json', issues: [] }
  }
  if (!isRecord(raw)) return { ok: false, reason: 'not_config', issues: [] }

  let body: unknown = raw
  if ('format' in raw || 'config' in raw) {
    if (raw.format !== CONFIG_FORMAT || !isRecord(raw.config)) {
      return { ok: false, reason: 'not_config', issues: [] }
    }
    const version = typeof raw.version === 'number' ? raw.version : 0
    if (version > CONFIG_FILE_VERSION) return { ok: false, reason: 'newer_version', issues: [], version }
    body = raw.config
  } else if (!('departments' in raw) || !('employees' in raw)) {
    return { ok: false, reason: 'not_config', issues: [] }
  }

  // config.replace never changes the building, floor templates or palette (they are tied to the
  // art), so the file's copies are ignored and the current ones are checked against its data.
  const withFixed = {
    ...(body as Record<string, unknown>),
    building: current.building,
    floorTemplates: current.floorTemplates,
    palette: current.palette,
  }
  const parsed = OrgConfigSchema.safeParse(withFixed)
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid',
      issues: parsed.error.issues.map((i) => ({
        level: 'error' as const,
        code: 'schema' as const,
        path: i.path.filter((p): p is string | number => typeof p !== 'symbol'),
        params: { message: i.message },
      })),
    }
  }

  const merged = applyConfigChange(current, { kind: 'config.replace', config: parsed.data })
  const issues = validateConfig(merged)
  if (hasErrors(issues)) return { ok: false, reason: 'invalid', issues }
  return { ok: true, config: parsed.data, merged, issues }
}

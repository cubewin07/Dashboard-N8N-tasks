import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { OrgConfig } from '@/domain/config'
import { applyConfigChange, pickEditable } from '@/domain/configChange'
import { summarizeImport } from '../configDiff'
import {
  CONFIG_FORMAT,
  CONFIG_FILE_VERSION,
  buildConfigFile,
  exportFileName,
  parseImport,
  serializeConfigFile,
} from '../envelope'

const NOW = '2026-11-26T20:30:00Z'

/** A config the boss has edited: renamed department, new rule, lower temp cap, one rule off. */
function editedConfig(): OrgConfig {
  const seed = makeSeedConfig()
  let cfg = applyConfigChange(seed, {
    kind: 'department.upsert',
    department: { ...seed.departments[0]!, label: { vi: 'Kho vận', en: 'Logistics' } },
  })
  cfg = applyConfigChange(cfg, {
    kind: 'rule.upsert',
    rule: {
      id: 'boss_refund',
      order: 9,
      enabled: true,
      label: { vi: 'Hoàn tiền', en: 'Refunds' },
      when: { tagsAny: ['refund'], amountVndGte: 500_000 },
      level: 'boss',
    },
  })
  cfg = applyConfigChange(cfg, {
    kind: 'rule.upsert',
    rule: { ...seed.approvalRules[0]!, enabled: false },
  })
  return applyConfigChange(cfg, {
    kind: 'policy.set',
    policy: { ...seed.policy, staffing: { ...seed.policy.staffing, tempCap: 4 } },
  })
}

describe('backup export / import (P10-T15)', () => {
  it('export → reset → import round-trips to a deep-equal config', () => {
    const edited = editedConfig()
    const file = serializeConfigFile(edited, NOW)

    const seed = makeSeedConfig()
    const reset = applyConfigChange(edited, { kind: 'config.replace', config: seed })
    expect(reset).not.toEqual(edited)

    const out = parseImport(file, reset)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.merged).toEqual(edited)
    expect(pickEditable(out.merged)).toEqual(pickEditable(edited))
  })

  it('writes a pretty-printed envelope; a bare config is accepted too', () => {
    const cfg = makeSeedConfig()
    const file = serializeConfigFile(cfg, NOW)
    expect(file.endsWith('\n')).toBe(true)
    expect(file).toContain('\n  "format": "ai-office-config"')
    const parsed = JSON.parse(file) as Record<string, unknown>
    expect(parsed).toMatchObject({ format: CONFIG_FORMAT, version: CONFIG_FILE_VERSION, exportedAt: NOW })
    expect(buildConfigFile(cfg, NOW).config).toBe(cfg)

    const bare = parseImport(JSON.stringify(pickEditable(cfg)), cfg)
    expect(bare.ok).toBe(true)
    const bareFull = parseImport(JSON.stringify(cfg), cfg)
    expect(bareFull.ok).toBe(true)
  })

  it('names the file with the Vietnamese calendar date', () => {
    expect(exportFileName('2026-11-26T20:30:00Z')).toBe('ai-office-config-2026-11-27.json')
    expect(exportFileName('2026-11-26T05:00:00Z')).toBe('ai-office-config-2026-11-26.json')
  })

  it('rejects text that is not JSON, not our file, or from a newer version', () => {
    const cfg = makeSeedConfig()
    expect(parseImport('{nope', cfg)).toMatchObject({ ok: false, reason: 'not_json' })
    expect(parseImport('[1,2]', cfg)).toMatchObject({ ok: false, reason: 'not_config' })
    expect(parseImport('{"hello":1}', cfg)).toMatchObject({ ok: false, reason: 'not_config' })
    expect(parseImport('{"format":"other","config":{}}', cfg)).toMatchObject({ ok: false, reason: 'not_config' })
    const newer = JSON.stringify({ format: CONFIG_FORMAT, version: 99, exportedAt: NOW, config: cfg })
    expect(parseImport(newer, cfg)).toMatchObject({ ok: false, reason: 'newer_version', version: 99 })
  })

  it('an invalid config shows issues and nothing is returned to apply', () => {
    const cfg = makeSeedConfig()
    const broken = { ...cfg, departments: [{ ...cfg.departments[0]!, key: 'Bad Key' }] }
    const out = parseImport(JSON.stringify(buildConfigFile(broken as OrgConfig, NOW)), cfg)
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe('invalid')
    expect(out.issues.length).toBeGreaterThan(0)
    expect(out.issues.every((i) => i.level === 'error' || i.level === 'warning')).toBe(true)
  })

  it('keeps the building, floor templates and palette of the current config', () => {
    const cfg = makeSeedConfig()
    const file = buildConfigFile({ ...cfg, palette: [], floorTemplates: [] }, NOW)
    const out = parseImport(JSON.stringify(file), cfg)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.merged.palette).toEqual(cfg.palette)
    expect(out.merged.floorTemplates).toEqual(cfg.floorTemplates)
    expect(out.merged.building).toEqual(cfg.building)
  })
})

describe('import diff summary (P10-T15)', () => {
  it('is empty for an identical config', () => {
    const cfg = makeSeedConfig()
    expect(summarizeImport(cfg, cfg).empty).toBe(true)
  })

  it('lists added / changed / removed names per collection and policy paths', () => {
    const seed = makeSeedConfig()
    const edited = editedConfig()
    const diff = summarizeImport(seed, edited)
    expect(diff.empty).toBe(false)
    const byName = Object.fromEntries(diff.collections.map((c) => [c.collection, c]))
    expect(byName.departments!.changed).toEqual(['Kho vận'])
    expect(byName.approvalRules!.added).toEqual(['Hoàn tiền'])
    expect(byName.approvalRules!.changed).toHaveLength(1)
    expect(diff.policy.map((p) => p.path)).toEqual(['staffing.tempCap'])

    const back = summarizeImport(edited, seed)
    expect(Object.fromEntries(back.collections.map((c) => [c.collection, c])).approvalRules!.removed).toEqual([
      'Hoàn tiền',
    ])
  })
})

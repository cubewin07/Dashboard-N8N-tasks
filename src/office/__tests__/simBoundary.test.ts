import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// P11-T09 / R5: only the registry may reach the simulator. Everything else (scene,
// domain, features, app) must keep working when src/adapters/sim is deleted.
const SRC = path.resolve(import.meta.dirname, '../..')
const ALLOWED = new Set(['office/feedRegistry.ts'])
const ALLOWED_PREFIXES = ['adapters/sim/', 'adapters/_nosim/']
const SIM_IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)['"](?:@\/adapters\/sim|(?:\.\.?\/)+(?:adapters\/)?sim)(?:\/[^'"]*)?['"]/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('simulator import boundary', () => {
  it('no file outside the registry and adapters/sim imports adapters/sim', () => {
    const offenders = walk(SRC)
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
      .filter((rel) => !ALLOWED.has(rel) && !ALLOWED_PREFIXES.some((p) => rel.startsWith(p)))
      .filter((rel) => !rel.includes('__tests__/'))
      .filter((rel) => SIM_IMPORT.test(fs.readFileSync(path.join(SRC, rel), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('the pattern catches the import forms it must', () => {
    expect(SIM_IMPORT.test("import { SimFeed } from '@/adapters/sim'")).toBe(true)
    expect(SIM_IMPORT.test("await import('@/adapters/sim')")).toBe(true)
    expect(SIM_IMPORT.test("import x from '@/adapters/sim/controls'")).toBe(true)
    expect(SIM_IMPORT.test("import x from '../adapters/sim/clock'")).toBe(true)
    expect(SIM_IMPORT.test("import { sim } from '@/i18n/vi/sim'")).toBe(false)
  })
})

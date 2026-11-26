// P10-T02 · validateConfig: zod shape first, then the invariants of phase-10 §3.3.
// Pure. Messages come from i18n (`t.adminIssues[code]`) by `code`; `params` fill the placeholders.
import { OrgConfigSchema, type OrgConfig } from './config'

export type ConfigIssueCode =
  /** zod shape / reference error from OrgConfigSchema; params.message holds the zod text. */
  | 'schema'
  // TODO(P10-T02): one code per invariant in phase-10 §3.3

export interface ConfigIssue {
  level: 'error' | 'warning'
  code: ConfigIssueCode
  /** Where in the config, e.g. ['employees', 3, 'roleKey']. */
  path: (string | number)[]
  params: Record<string, string | number>
}

export function hasErrors(issues: readonly ConfigIssue[]): boolean {
  return issues.some((i) => i.level === 'error')
}

/**
 * Every write path (forms, import, reset; Local and Supabase adapters) runs this on the whole
 * resulting config before saving (R10). Errors refuse the change; warnings are shown only.
 */
export function validateConfig(config: OrgConfig | unknown): ConfigIssue[] {
  const parsed = OrgConfigSchema.safeParse(config)
  if (!parsed.success) {
    return parsed.error.issues.map((i) => ({
      level: 'error' as const,
      code: 'schema' as const,
      path: i.path.filter((p): p is string | number => typeof p !== 'symbol'),
      params: { message: i.message },
    }))
  }
  return []
}

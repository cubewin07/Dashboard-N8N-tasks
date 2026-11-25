// Generates supabase/migrations/0003_seed_org.sql from src/content/*.json.
//   node scripts/seed-sql.mjs                       write 0003
//   node scripts/seed-sql.mjs --check               exit 1 when 0003 on disk is stale
//   node scripts/seed-sql.mjs --since <ref> --out <file>
//       emit only rows whose ids are not in the content at git <ref> (a later seed migration)
// Validation reuses the zod schemas from src/domain/config.ts through vite (as content-validate does).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

const rootDir = path.resolve(import.meta.dirname, '..')
const defaultOut = path.join(rootDir, 'supabase/migrations/0003_seed_org.sql')

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const check = flag('--check')
const since = value('--since')
const outPath = value('--out') ? path.resolve(value('--out')) : defaultOut
if (since && !value('--out') && !check) {
  console.error('--since needs --out <new migration file>')
  process.exit(2)
}

const FILES = {
  org: 'org.seed.json',
  roles: 'roles.json',
  specialties: 'specialties.json',
  platforms: 'platforms.json',
  taskTypes: 'task-types.json',
  approvalRules: 'approval-rules.json',
  policy: 'policy.json',
}

function loadContent(ref) {
  const out = {}
  for (const [k, f] of Object.entries(FILES)) {
    const rel = `src/content/${f}`
    const text = ref
      ? execFileSync('git', ['show', `${ref}:${rel}`], { cwd: rootDir, encoding: 'utf8' })
      : fs.readFileSync(path.join(rootDir, rel), 'utf8')
    out[k] = JSON.parse(text)
  }
  return out
}

// ---- SQL literals ----
const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replaceAll("'", "''")}'`)
const jb = (v) => `${q(JSON.stringify(v))}::jsonb`
const ts = (s) => (s === null || s === undefined ? 'null' : `${q(s)}::timestamptz`)
const arr = (a) => (a.length === 0 ? `'{}'::text[]` : `array[${a.map(q).join(', ')}]::text[]`)
const omitKey = (o) => {
  const { key: _key, ...rest } = o
  return rest
}

// Table definitions in FK order: name, columns, pk field(s), row -> values.
const TABLES = [
  {
    name: 'departments',
    cols: ['id', 'key', 'label', '"order"', 'color_swatch', 'icon', 'hours', 'floor_template', 'active'],
    pk: 'id',
    rows: (c) => c.org.departments,
    vals: (d) => [q(d.id), q(d.key), jb(d.label), d.order, q(d.colorSwatch), q(d.icon), q(d.hours), q(d.floorTemplate), d.active],
  },
  { name: 'roles', cols: ['key', 'def'], pk: 'key', rows: (c) => c.roles, vals: (r) => [q(r.key), jb(omitKey(r))] },
  { name: 'specialties', cols: ['key', 'def'], pk: 'key', rows: (c) => c.specialties, vals: (r) => [q(r.key), jb(omitKey(r))] },
  { name: 'platforms', cols: ['key', 'def'], pk: 'key', rows: (c) => c.platforms, vals: (r) => [q(r.key), jb(omitKey(r))] },
  {
    name: 'shops',
    cols: ['id', 'platform_key', 'name', 'handle'],
    pk: 'id',
    rows: (c) => c.org.shops,
    vals: (s) => [q(s.id), q(s.platformKey), q(s.name), q(s.handle)],
  },
  { name: 'task_types', cols: ['key', 'def'], pk: 'key', rows: (c) => c.taskTypes, vals: (r) => [q(r.key), jb(omitKey(r))] },
  {
    name: 'employees',
    cols: ['id', 'name', 'department_id', 'role_key', 'specialties', 'kind', 'state', 'review_mode', 'model_tier_override', 'bio', 'created_at', 'created_by', 'archived_at'],
    pk: 'id',
    rows: (c) => c.org.employees,
    vals: (e) => [
      q(e.id), q(e.name), q(e.departmentId), q(e.roleKey), arr(e.specialties), q(e.kind), q(e.state),
      q(e.reviewMode), q(e.modelTierOverride), e.bio ? jb(e.bio) : 'null', ts(e.createdAt), q(e.createdBy), ts(e.archivedAt),
    ],
  },
  {
    name: 'approval_rules',
    cols: ['id', '"order"', 'enabled', 'label', '"when"', 'level'],
    pk: 'id',
    rows: (c) => c.approvalRules,
    vals: (r) => [q(r.id), r.order, r.enabled, jb(r.label), jb(r.when), `${q(r.level)}::public.approval_level`],
  },
  {
    name: 'policy',
    cols: ['id', 'doc'],
    pk: () => '1',
    rows: (c) => [c.policy],
    vals: (p) => [1, jb(p)],
  },
]

const pkOf = (t, row) => (typeof t.pk === 'function' ? t.pk(row) : row[t.pk])

function generate(content, baseline) {
  const lines = [
    '-- GENERATED, do not edit; run npm run seed:sql',
    baseline
      ? `-- Rows added to src/content since ${since}. Idempotent (on conflict do nothing).`
      : '-- Seed of the org config from src/content/*.json. Idempotent (on conflict do nothing).',
    '',
  ]
  let any = false
  for (const t of TABLES) {
    const known = baseline ? new Set(t.rows(baseline).map((r) => pkOf(t, r))) : new Set()
    const rows = t.rows(content).filter((r) => !known.has(pkOf(t, r)))
    if (rows.length === 0) continue
    any = true
    lines.push(`insert into public.${t.name} (${t.cols.join(', ')}) values`)
    lines.push(rows.map((r) => `  (${t.vals(r).join(', ')})`).join(',\n'))
    lines.push('on conflict do nothing;', '')
  }
  if (baseline && !any) lines.push('-- (no new rows)', '')
  return lines.join('\n')
}

// ---- validate with the real schemas ----
async function validate(content) {
  const server = await createServer({
    root: rootDir,
    configFile: false,
    cacheDir: path.join(os.tmpdir(), 'ai-office-vite-seed-sql'),
    resolve: { alias: { '@': path.join(rootDir, 'src') } },
    logLevel: 'silent',
    server: { middlewareMode: true, ws: false },
    appType: 'custom',
  })
  try {
    const m = await server.ssrLoadModule('/src/domain/config.ts')
    const checks = [
      ['org.seed.json departments', m.DepartmentSchema, content.org.departments],
      ['org.seed.json employees', m.EmployeeSchema, content.org.employees],
      ['org.seed.json shops', m.ShopSchema, content.org.shops],
      ['roles.json', m.RoleDefSchema, content.roles],
      ['specialties.json', m.SpecialtySchema, content.specialties],
      ['platforms.json', m.PlatformSchema, content.platforms],
      ['task-types.json', m.TaskTypeSchema, content.taskTypes],
      ['approval-rules.json', m.ApprovalRuleSchema, content.approvalRules],
      ['policy.json', m.PolicySchema, [content.policy]],
    ]
    let bad = false
    for (const [name, schema, items] of checks) {
      items.forEach((item, i) => {
        const r = schema.safeParse(item)
        if (r.success) return
        bad = true
        for (const issue of r.error.issues) console.error(`  - [${name}] #${i} ${issue.path.join('.')}: ${issue.message}`)
      })
    }
    // Cross references the DB enforces with foreign keys.
    const deps = new Set(content.org.departments.map((d) => d.id))
    const roleKeys = new Set(content.roles.map((r) => r.key))
    const platKeys = new Set(content.platforms.map((p) => p.key))
    for (const e of content.org.employees) {
      if (e.departmentId && !deps.has(e.departmentId)) { bad = true; console.error(`  - employee ${e.id}: unknown department ${e.departmentId}`) }
      if (!roleKeys.has(e.roleKey)) { bad = true; console.error(`  - employee ${e.id}: unknown role ${e.roleKey}`) }
    }
    for (const s of content.org.shops) {
      if (!platKeys.has(s.platformKey)) { bad = true; console.error(`  - shop ${s.id}: unknown platform ${s.platformKey}`) }
    }
    if (bad) {
      console.error('seed-sql: content validation failed')
      process.exit(1)
    }
  } finally {
    await server.close()
  }
}

const content = loadContent(null)
await validate(content)
const sql = generate(content, since ? loadContent(since) : null)

if (check) {
  const target = since ? outPath : defaultOut
  const onDisk = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
  if (onDisk !== sql) {
    console.error(`seed-sql: ${path.relative(rootDir, target)} is stale; run npm run seed:sql`)
    process.exit(1)
  }
  console.log(`seed-sql: ${path.relative(rootDir, target)} is up to date`)
} else {
  fs.writeFileSync(outPath, sql)
  console.log(`seed-sql: wrote ${path.relative(rootDir, outPath)}`)
}

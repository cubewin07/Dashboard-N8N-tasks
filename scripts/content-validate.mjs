import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

const rootDir = path.resolve(import.meta.dirname, '..')
const defaultContentDir = path.join(rootDir, 'src/content')
const contentDir = process.env.CONTENT_DIR
  ? path.resolve(process.env.CONTENT_DIR)
  : defaultContentDir

const FILE_FOR_SECTION = {
  departments: 'src/content/org.seed.json',
  employees: 'src/content/org.seed.json',
  shops: 'src/content/org.seed.json',
  roles: 'src/content/roles.json',
  specialties: 'src/content/specialties.json',
  platforms: 'src/content/platforms.json',
  approvalRules: 'src/content/approval-rules.json',
  policy: 'src/content/policy.json',
  taskTypes: 'src/content/task-types.json',
  building: 'src/content/building.json',
  palette: 'src/content/palette.json',
  floorTemplates: 'src/content/floor-templates/*.json',
}

function readJson(relPath) {
  const fullPath = path.join(contentDir, relPath)
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'))
  } catch (err) {
    console.error(`Error reading src/content/${relPath}: ${err.message}`)
    process.exit(1)
  }
}

const orgSeed = readJson('org.seed.json')
const roles = readJson('roles.json')
const specialties = readJson('specialties.json')
const platforms = readJson('platforms.json')
const approvalRules = readJson('approval-rules.json')
const policy = readJson('policy.json')
const taskTypes = readJson('task-types.json')
const building = readJson('building.json')
const palette = readJson('palette.json')

const templatesDir = path.join(contentDir, 'floor-templates')
const floorTemplates = fs.existsSync(templatesDir)
  ? fs
      .readdirSync(templatesDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => readJson(path.join('floor-templates', f)))
  : []

const rawConfig = {
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
  floorTemplates,
  palette,
}

const server = await createServer({
  root: rootDir,
  configFile: false,
  cacheDir: path.join(os.tmpdir(), 'ai-office-vite-content-validate'),
  resolve: {
    alias: {
      '@': path.join(rootDir, 'src'),
    },
  },
  logLevel: 'silent',
  server: { middlewareMode: true, ws: false },
  appType: 'custom',
})

try {
  const { OrgConfigSchema } = await server.ssrLoadModule('/src/domain/config.ts')
  const res = OrgConfigSchema.safeParse(rawConfig)
  if (!res.success) {
    console.error('Content validation failed:')
    for (const issue of res.error.issues) {
      const topKey = String(issue.path[0] ?? '')
      const sourceFile = FILE_FOR_SECTION[topKey] ?? 'src/content'
      const fieldPath = issue.path.join('.')
      console.error(`  - [${sourceFile}] ${fieldPath}: ${issue.message}`)
    }
    process.exitCode = 1
  } else {
    const cfg = res.data
    const titlesPath = path.join(
      rootDir,
      'src/adapters/sim/content/vi/titles.ts',
    )
    if (fs.existsSync(titlesPath)) {
      const { ALLOWED_TITLE_SLOTS, TASK_TITLE_TEMPLATES_VI } =
        await server.ssrLoadModule('/src/adapters/sim/content/vi/titles.ts')
      const allowedSet = new Set(ALLOWED_TITLE_SLOTS)
      const titleErrors = []

      for (const tt of cfg.taskTypes) {
        const templates = TASK_TITLE_TEMPLATES_VI[tt.key]
        if (!Array.isArray(templates) || templates.length === 0) {
          titleErrors.push(
            `  - [src/adapters/sim/content/vi/titles.ts] Missing title template for taskType "${tt.key}"`,
          )
        }
      }

      for (const [typeKey, templates] of Object.entries(
        TASK_TITLE_TEMPLATES_VI,
      )) {
        for (const tpl of templates) {
          const matches = [...tpl.matchAll(/\{([^}]*)\}/g)]
          for (const m of matches) {
            const slot = m[1]
            if (!allowedSet.has(slot)) {
              titleErrors.push(
                `  - [src/adapters/sim/content/vi/titles.ts] Unknown slot "{${slot}}" in template for "${typeKey}": "${tpl}"`,
              )
            }
          }
          const stripped = tpl.replace(/\{\w+\}/g, '')
          if (stripped.includes('{') || stripped.includes('}')) {
            titleErrors.push(
              `  - [src/adapters/sim/content/vi/titles.ts] Malformed brace in template for "${typeKey}": "${tpl}"`,
            )
          }
        }
      }

      if (titleErrors.length > 0) {
        console.error('Task title template validation failed:')
        for (const err of titleErrors) {
          console.error(err)
        }
        process.exitCode = 1
      }
    }

    // P05: presentation data (not part of OrgConfig).
    const visual = await server.ssrLoadModule('/src/domain/visual.ts')
    const swatchKeys = new Set(cfg.palette.map((sw) => sw.key))
    const presentation = [
      ['visual-language.json', visual.VisualLanguageSchema],
      ['idle-behaviours.json', visual.IdleBehavioursSchema],
    ]
    for (const [file, schema] of presentation) {
      const parsed = schema.safeParse(readJson(file))
      if (!parsed.success) {
        console.error(`Content validation failed for src/content/${file}:`)
        for (const issue of parsed.error.issues) {
          console.error(`  - [src/content/${file}] ${issue.path.join('.')}: ${issue.message}`)
        }
        process.exitCode = 1
        continue
      }
      if (file === 'visual-language.json') {
        // Every colour must be a palette swatch.
        const walk = (node, at) => {
          if (node && typeof node === 'object') {
            for (const [k, v] of Object.entries(node)) walk(v, `${at}.${k}`)
          } else if (typeof node === 'string' && /(swatch|Swatch|priorityEdge|deskGlow)/.test(at) && !swatchKeys.has(node)) {
            console.error(`  - [src/content/${file}] ${at.slice(1)}: unknown palette swatch "${node}"`)
            process.exitCode = 1
          }
        }
        walk(parsed.data, '')
      }
    }
    for (const [idx, p] of cfg.platforms.entries()) {
      if (!swatchKeys.has(p.badge.swatch)) {
        console.error(`  - [src/content/platforms.json] ${idx}.badge.swatch: unknown palette swatch "${p.badge.swatch}"`)
        process.exitCode = 1
      }
    }

    if (!process.exitCode) {
      console.log(
        `OK: Validated content (${cfg.departments.length} departments, ${cfg.employees.length} employees, ${cfg.roles.length} roles, ${cfg.specialties.length} specialties, ${cfg.platforms.length} platforms, ${cfg.shops.length} shops, ${cfg.approvalRules.length} rules, ${cfg.taskTypes.length} task types, ${cfg.floorTemplates.length} floor templates).`,
      )
    }
  }
} finally {
  await server.close()
}

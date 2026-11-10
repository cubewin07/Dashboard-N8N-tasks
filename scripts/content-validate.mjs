import fs from 'node:fs'
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
    console.log(
      `OK: Validated content (${cfg.departments.length} departments, ${cfg.employees.length} employees, ${cfg.roles.length} roles, ${cfg.specialties.length} specialties, ${cfg.platforms.length} platforms, ${cfg.shops.length} shops, ${cfg.approvalRules.length} rules).`,
    )
  }
} finally {
  await server.close()
}

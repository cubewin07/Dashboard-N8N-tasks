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

/**
 * `furniture-map.json`: schema, then every slot key, template key, model and
 * node name against the floor templates and `public/assets/manifest.json`.
 * Top-level sections this script does not know are left alone.
 * Returns the number of distinct models checked.
 */
async function validateFurnitureMap(server, cfg) {
  const FILE = 'src/content/furniture-map.json'
  const errors = []
  const fail = (at, message) => errors.push(`  - [${FILE}] ${at}: ${message}`)
  const report = () => {
    if (errors.length === 0) return
    console.error(`Content validation failed for ${FILE}:`)
    for (const line of errors) console.error(line)
    process.exitCode = 1
  }

  let FurnitureMapSchema
  try {
    ;({ FurnitureMapSchema } = await server.ssrLoadModule(
      '/src/scene/render/assets/furnitureMap.ts',
    ))
  } catch (err) {
    // The module parses the default file on import, so a bad file lands here.
    if (!Array.isArray(err?.issues)) throw err
    for (const issue of err.issues) fail(issue.path.join('.'), issue.message)
    report()
    return 0
  }
  const parsed = FurnitureMapSchema.safeParse(readJson('furniture-map.json'))
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fail(issue.path.join('.'), issue.message)
    report()
    return 0
  }
  const map = parsed.data

  const manifestPath = path.join(rootDir, 'public/assets/manifest.json')
  let files
  try {
    files = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).files ?? {}
  } catch (err) {
    fail('(manifest)', `cannot read public/assets/manifest.json: ${err.message}`)
    report()
    return 0
  }

  const { SlotTypeSchema } = await server.ssrLoadModule('/src/domain/config.ts')
  const slotTypes = new Set(SlotTypeSchema.options)
  // A slot key is a slot type, a slot id, or a slot id without its `_N` suffix.
  const idsOf = (tpl) => {
    const ids = new Set()
    for (const slot of tpl.fixedSlots) {
      ids.add(slot.id)
      ids.add(slot.id.replace(/_\d+$/, ''))
    }
    return ids
  }
  const idsByTemplate = new Map(cfg.floorTemplates.map((tpl) => [tpl.key, idsOf(tpl)]))
  const allIds = new Set([...idsByTemplate.values()].flatMap((ids) => [...ids]))

  const seen = new Set()
  const checkModel = (at, model, node) => {
    seen.add(model)
    const entry = files[model]
    if (!entry) {
      fail(at, `unknown model "${model}" (not in public/assets/manifest.json)`)
      return
    }
    if (node !== undefined && !(entry.nodes ?? []).includes(node)) {
      const known = (entry.nodes ?? []).join(', ') || 'none'
      fail(at, `model "${model}" has no node "${node}" (nodes: ${known})`)
    }
  }
  const checkSlots = (at, slots, ids, where) => {
    for (const [key, art] of Object.entries(slots ?? {})) {
      if (!slotTypes.has(key) && !ids.has(key)) {
        fail(`${at}.${key}`, `"${key}" is neither a slot type nor a slot id ${where}`)
      }
      art.models.forEach((ref, i) =>
        checkModel(`${at}.${key}.models.${i}`, ref.model, ref.node),
      )
      art.companions?.forEach((ref, i) =>
        checkModel(`${at}.${key}.companions.${i}`, ref.model, ref.node),
      )
    }
  }

  checkSlots('slots', map.slots, allIds, 'in any floor template')
  for (const [key, tpl] of Object.entries(map.templates ?? {})) {
    const ids = idsByTemplate.get(key)
    if (!ids) {
      const known = [...idsByTemplate.keys()].join(', ')
      fail(`templates.${key}`, `unknown floor template "${key}" (templates: ${known})`)
    }
    checkSlots(`templates.${key}.slots`, tpl.slots, ids ?? new Set(), `of template "${key}"`)
    tpl.extras?.forEach((extra, i) =>
      checkModel(`templates.${key}.extras.${i}`, extra.model, extra.node),
    )
  }
  for (const [key, value] of Object.entries(map.kit)) {
    if (Array.isArray(value)) value.forEach((model, i) => checkModel(`kit.${key}.${i}`, model))
    else checkModel(`kit.${key}`, value)
  }
  map.exterior?.props.forEach((prop, i) => checkModel(`exterior.props.${i}`, prop.model))
  if (map.exterior?.sign) checkModel('exterior.sign', map.exterior.sign.model)

  report()
  return seen.size
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

    // P06b: which model stands on which slot (not part of OrgConfig).
    const furnitureModels = await validateFurnitureMap(server, cfg)

    if (!process.exitCode) {
      console.log(
        `OK: Validated content (${cfg.departments.length} departments, ${cfg.employees.length} employees, ${cfg.roles.length} roles, ${cfg.specialties.length} specialties, ${cfg.platforms.length} platforms, ${cfg.shops.length} shops, ${cfg.approvalRules.length} rules, ${cfg.taskTypes.length} task types, ${cfg.floorTemplates.length} floor templates, ${furnitureModels} furniture-map models).`,
      )
    }
  }
} finally {
  await server.close()
}

// P11-T03: bundle budgets (docs/plan/performance.md §2). Walks the built module graph:
// the initial graph is the entry plus everything it imports statically. Prints a table
// (and a GitHub job summary when GITHUB_STEP_SUMMARY is set) and fails on a broken budget.
//
//   node scripts/size-budget.mjs           check dist/
//   node scripts/size-budget.mjs --json    machine-readable output
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const KB = 1024
const BUDGET = {
  initialGz: 250 * KB,
  officeGz: 450 * KB,
  routeGz: 60 * KB,
  simGz: 60 * KB,
}
const FORBIDDEN_IN_INITIAL = ['WebGLRenderer', 'PerspectiveCamera', 'troika']
// 2D route chunks (lazy pages). The office page itself is tiny; the 3D lives in OfficeCanvas.
const ROUTE_RE = /^(OfficePage|OrgPage|QueuePage|ActivityPage|WardrobePage|SettingsPage|AdminPage|CreditsPage|LibraryPage|ResetPasswordPage)-/

const dist = path.resolve(import.meta.dirname, '../dist')
const assets = path.join(dist, 'assets')
if (!fs.existsSync(assets)) {
  console.error('dist/assets not found. Run `npm run build` first.')
  process.exit(1)
}

const files = fs.readdirSync(assets).filter((f) => f.endsWith('.js'))
const cache = new Map()
function info(file) {
  if (cache.has(file)) return cache.get(file)
  const code = fs.readFileSync(path.join(assets, file), 'utf8')
  const gz = zlib.gzipSync(code, { level: 9 }).length
  const staticImports = new Set()
  const dynamicImports = new Set()
  // Minified rolldown output: `import{a}from"./x-HASH.js"`, `import"./x.js"`, `import("./x.js")`.
  for (const m of code.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) staticImports.add(m[1])
  for (const m of code.matchAll(/import\(\s*["']\.\/([^"']+\.js)["']\s*\)/g)) dynamicImports.add(m[1])
  const entry = { file, code, gz, staticImports: [...staticImports], dynamicImports: [...dynamicImports] }
  cache.set(file, entry)
  return entry
}

function closure(start) {
  const seen = new Set()
  const stack = [start]
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f) || !files.includes(f)) continue
    seen.add(f)
    for (const s of info(f).staticImports) stack.push(s)
  }
  return seen
}

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
const entryMatch = html.match(/<script[^>]+src="[^"]*\/assets\/([^"]+\.js)"/)
if (!entryMatch) {
  console.error('Could not find the entry script in dist/index.html')
  process.exit(1)
}
const entry = entryMatch[1]
const initial = closure(entry)
const sum = (set) => [...set].reduce((n, f) => n + info(f).gz, 0)
const initialGz = sum(initial)

const failures = []
const rows = []
const fmt = (b) => `${(b / KB).toFixed(1)} KB`

rows.push(['initial graph (entry + static imports)', initialGz, BUDGET.initialGz])
if (initialGz > BUDGET.initialGz) failures.push(`initial graph ${fmt(initialGz)} > ${fmt(BUDGET.initialGz)}`)
for (const f of initial) {
  for (const token of FORBIDDEN_IN_INITIAL) {
    if (info(f).code.includes(token)) failures.push(`initial chunk ${f} contains 3D token "${token}"`)
  }
}

// The office chunk: OfficeCanvas plus whatever it pulls in that the initial graph does not.
const officeEntry = files.find((f) => f.startsWith('OfficeCanvas-'))
if (officeEntry) {
  const office = [...closure(officeEntry)].filter((f) => !initial.has(f))
  const officeGz = office.reduce((n, f) => n + info(f).gz, 0)
  rows.push(['office graph (OfficeCanvas, beyond initial)', officeGz, BUDGET.officeGz])
  if (officeGz > BUDGET.officeGz) failures.push(`office graph ${fmt(officeGz)} > ${fmt(BUDGET.officeGz)}`)
}

for (const f of files.filter((x) => ROUTE_RE.test(x)).sort()) {
  const gz = info(f).gz
  rows.push([`route ${f.replace(/-[\w-]+\.js$/, '')}`, gz, BUDGET.routeGz])
  if (gz > BUDGET.routeGz) failures.push(`route chunk ${f} ${fmt(gz)} > ${fmt(BUDGET.routeGz)}`)
}

const simChunks = files.filter((f) => /^(SimFeed|sim|index\.sim)/i.test(f))
for (const f of simChunks) {
  const gz = info(f).gz
  rows.push([`sim ${f}`, gz, BUDGET.simGz])
  if (gz > BUDGET.simGz) failures.push(`sim chunk ${f} ${fmt(gz)} > ${fmt(BUDGET.simGz)}`)
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ initialGz, initial: [...initial], rows, failures }, null, 2))
} else {
  const lines = ['| bundle | gzip | budget |', '| --- | ---: | ---: |']
  for (const [name, gz, budget] of rows) {
    lines.push(`| ${name} | ${fmt(gz)} | ${fmt(budget)}${gz > budget ? ' ❌' : ''} |`)
  }
  lines.push('', `Initial chunks: ${[...initial].map((f) => `${f} (${fmt(info(f).gz)})`).join(', ')}`)
  const out = lines.join('\n')
  console.log(out)
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Bundle budgets\n\n${out}\n`)
  }
}

if (failures.length) {
  console.error(`\nBudget failures:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('\nOK: all bundle budgets hold.')

// Wardrobe worst-case budget (P08a-T12, R3/R7).
//  * Lists the 20 heaviest assembled outfits per body base (body + one item per slot, following the
//    layering rules: fullbody hides top+bottom, outer needs a top or fullbody, a hat with
//    meta.hairClip "crown" swaps the hair to its *_hatcut file) and fails above 8 000 tris.
//  * Prints per-slot item counts and byte totals (GLBs + thumbnails) and the public/assets total.
//  * With --base <git ref>, also reports the bytes this branch adds to public/assets (R7: <= 13 MB).
// Usage:
//   node scripts/catalog-budget.mjs [--base stack/p07b-characters] [--top 20] [--json out.json]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ASSETS_DIR, ROOT, walk } from './lib/assets.mjs'

const OUTFIT_TRI_BUDGET = 8000
const ASSETS_TOTAL_BUDGET = 30 * 1024 * 1024
const PHASE_ADD_BUDGET = 13 * 1024 * 1024
const NON_SLOT_FILES = new Set(['colors', 'face-atlas', 'generator-weights', 'presets'])
const BASES = ['female', 'male']

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : dflt
}
const TOP_N = Number(opt('--top', '20'))
const baseRef = opt('--base', null)
const jsonOut = opt('--json', join(ROOT, 'art', 'out', 'reports', 'catalog-budget.json'))

const manifest = JSON.parse(readFileSync(join(ASSETS_DIR, 'manifest.json'), 'utf8')).files ?? {}
const catalogDir = join(ROOT, 'src', 'content', 'catalog')
const items = []
for (const name of readdirSync(catalogDir).sort()) {
  if (!name.endsWith('.json') || NON_SLOT_FILES.has(name.replace(/\.json$/, ''))) continue
  const data = JSON.parse(readFileSync(join(catalogDir, name), 'utf8'))
  for (const row of data.items ?? []) if (!row.retired) items.push(row)
}

const stem = (file) => file.replace(/^.*\//, '').replace(/\.glb$/, '')
const missing = []
function trisOf(file) {
  const m = manifest[stem(file)]
  if (!m) {
    missing.push(stem(file))
    return 0
  }
  return m.tris
}
function metaOf(id) {
  const p = join(ASSETS_DIR, 'models', 'wardrobe', `${id}.meta.json`)
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}
}

const bodyTris = Object.fromEntries(BASES.map((b) => [b, trisOf(`models/characters/body_${b}.glb`)]))

/** Options per slot for one base: [{ id, tris, hatcutTris?, hairClip? }] (face parts are 0 tris). */
function slotOptions(base) {
  const bySlot = new Map()
  for (const row of items) {
    if (!row.bases.includes(base)) continue
    const file = row.model?.[base]
    const meta = file ? metaOf(row.id) : {}
    const opt = { id: row.id, tris: file ? trisOf(file) : 0 }
    if (meta.hatcut) opt.hatcutTris = trisOf(meta.hatcut)
    if (meta.hairClip) opt.hairClip = meta.hairClip
    if (!bySlot.has(row.slot)) bySlot.set(row.slot, [])
    bySlot.get(row.slot).push(opt)
  }
  return bySlot
}

/** Keep the k heaviest partial outfits while folding in one group of alternatives. */
function fold(partials, group, k) {
  const next = []
  for (const p of partials) for (const g of group) next.push({ tris: p.tris + g.tris, ids: [...p.ids, ...g.ids] })
  next.sort((a, b) => b.tris - a.tris)
  return next.slice(0, k)
}

function heaviest(base, k) {
  const bySlot = slotOptions(base)
  const opts = (slot) => (bySlot.get(slot) ?? []).map((o) => ({ tris: o.tris, ids: [o.id] }))
  const none = [{ tris: 0, ids: [] }]
  // Hair x head is one group: a crown-clipping hat swaps the hair to its hatcut.
  const hairHead = []
  for (const h of [...(bySlot.get('hair') ?? []), null]) {
    for (const hat of [...(bySlot.get('head') ?? []), null]) {
      const hairTris = h ? (hat?.hairClip === 'crown' && h.hatcutTris != null ? h.hatcutTris : h.tris) : 0
      hairHead.push({ tris: hairTris + (hat?.tris ?? 0), ids: [h?.id, hat?.id].filter(Boolean) })
    }
  }
  const independent = [...bySlot.keys()].filter((s) => !['hair', 'head', 'top', 'bottom', 'fullbody', 'outer'].includes(s))
  let rest = [{ tris: bodyTris[base], ids: [`body_${base}`] }]
  rest = fold(rest, hairHead, k)
  for (const slot of independent) rest = fold(rest, [...opts(slot), ...none], k)
  // Clothing: (top + bottom) or fullbody, then an optional outer (needs a top or fullbody).
  const outer = [...opts('outer'), ...none]
  let separates = fold(fold(none, opts('top'), k), [...opts('bottom'), ...none], k)
  separates = fold(separates, outer, k)
  const onePiece = fold(opts('fullbody'), outer, k)
  const clothing = [...separates, ...onePiece].sort((a, b) => b.tris - a.tris).slice(0, k)
  return fold(rest, clothing, k)
}

function fmtMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// ---- worst-case outfits
const report = { budgetTris: OUTFIT_TRI_BUDGET, outfits: {}, slots: {}, bytes: {} }
let failed = false
for (const base of BASES) {
  const top = heaviest(base, TOP_N)
  report.outfits[base] = top
  const worst = top[0]?.tris ?? 0
  const ok = worst <= OUTFIT_TRI_BUDGET
  failed ||= !ok
  console.log(`\n${base}: ${TOP_N} heaviest outfits (budget ${OUTFIT_TRI_BUDGET} tris incl. body ${bodyTris[base]})`)
  for (const [i, o] of top.entries()) {
    if (i < 5 || i === top.length - 1) console.log(`  ${String(i + 1).padStart(2)}. ${o.tris} tris  ${o.ids.slice(1).join(' + ')}`)
    else if (i === 5) console.log('  ...')
  }
  console.log(`  ${ok ? 'OK' : 'FAIL'} worst ${worst} tris`)
}

// ---- per-slot counts and bytes
const fileBytes = (rel) => {
  const p = join(ASSETS_DIR, rel)
  return existsSync(p) ? statSync(p).size : 0
}
console.log('\nslot          items  glb bytes   thumb bytes')
const slots = [...new Set(items.map((r) => r.slot))].sort()
for (const slot of slots) {
  const rows = items.filter((r) => r.slot === slot)
  const files = new Set()
  for (const r of rows) {
    for (const f of Object.values(r.model ?? {})) files.add(f)
    const meta = r.model ? metaOf(r.id) : {}
    if (meta.hatcut) files.add(meta.hatcut)
  }
  const glb = [...files].reduce((s, f) => s + fileBytes(f), 0)
  const thumbs = rows.reduce((s, r) => s + fileBytes(r.thumb), 0)
  report.slots[slot] = { items: rows.length, glbBytes: glb, thumbBytes: thumbs }
  console.log(`${slot.padEnd(13)} ${String(rows.length).padStart(5)}  ${fmtMB(glb).padStart(9)}  ${fmtMB(thumbs).padStart(10)}`)
}
const meshItems = items.length
console.log(`total items: ${meshItems}`)

// ---- assets totals
const total = walk(ASSETS_DIR).reduce((s, p) => s + statSync(p).size, 0)
report.bytes.assetsTotal = total
const totalOk = total <= ASSETS_TOTAL_BUDGET
failed ||= !totalOk
console.log(`\npublic/assets total: ${fmtMB(total)} (budget ${fmtMB(ASSETS_TOTAL_BUDGET)}) ${totalOk ? 'OK' : 'FAIL'}`)
if (baseRef) {
  const out = execFileSync('git', ['ls-tree', '-r', '-l', baseRef, '--', 'public/assets'], { cwd: ROOT, encoding: 'utf8' })
  const baseTotal = out
    .split('\n')
    .filter(Boolean)
    .reduce((s, line) => s + (Number(line.split(/\s+/)[3]) || 0), 0)
  const added = total - baseTotal
  report.bytes.base = baseRef
  report.bytes.added = added
  const addOk = added <= PHASE_ADD_BUDGET
  failed ||= !addOk
  console.log(`added since ${baseRef}: ${fmtMB(added)} (budget ${fmtMB(PHASE_ADD_BUDGET)}) ${addOk ? 'OK' : 'FAIL'}`)
}

if (missing.length) {
  failed = true
  console.log(`\nmissing from manifest (run npm run assets:manifest): ${[...new Set(missing)].join(', ')}`)
}
mkdirSync(dirname(jsonOut), { recursive: true })
writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`)
process.exit(failed ? 1 : 0)

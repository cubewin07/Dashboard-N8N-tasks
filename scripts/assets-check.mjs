// Validates committed assets (no Blender needed, runs in CI). Fails on: bad name, unregistered
// file, over tri/size budget, foreign material or texture, >1 UV set, a primitive without the
// baked AO vertex colours (COLOR_0), missing anchors/nodes,
// licence ledger not 1:1, stale manifest. `--strict` also requires every target to exist.
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  ALLOWED_MATERIALS, ASSETS_DIR, createIO, inspectGlb, loadTargets, MODELS_DIR, rel, ROOT, sha256, TRI_BUDGET, walk,
} from './lib/assets.mjs'

const strict = process.argv.includes('--strict')
const MAX_FILE = 1.5 * 1024 * 1024
const GROUP_BUDGET = [
  { label: 'env + props + decor', dirs: ['models/env', 'models/props', 'models/decor'], max: 8 * 1024 * 1024 },
  { label: 'characters + anim', dirs: ['models/characters', 'anim'], max: 6 * 1024 * 1024 },
  { label: 'wardrobe + thumbs', dirs: ['models/wardrobe', 'thumbs'], max: 15 * 1024 * 1024 },
]
const errors = []
const err = (file, msg) => errors.push(`${file}: ${msg}`)

const targets = new Map(loadTargets().map((t) => [t.name, t]))
const rigPath = join(ROOT, 'art', 'rig.json')
const rig = existsSync(rigPath) ? JSON.parse(readFileSync(rigPath, 'utf8')) : null
const manifestPath = join(ASSETS_DIR, 'manifest.json')
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).files : {}
const io = await createIO()
const glbs = walk(MODELS_DIR).filter((f) => f.endsWith('.glb'))
const byFamily = new Map()

for (const file of glbs) {
  const name = basename(file, '.glb')
  const r = rel(file)
  if (!/^(body_(female|male)|[a-z0-9]+(_[a-z0-9]+)*_\d{2}(_[fm])?)$/.test(name)) {
    err(r, 'name must be category_name_NN[_f|_m] in snake_case or body_female/body_male')
  }
  const t = targets.get(name)
  if (!t) { err(r, 'not registered in art/targets.json'); continue }
  if (t.out !== r) err(r, `targets.json expects it at ${t.out}`)
  const i = await inspectGlb(io, file)
  const fam = byFamily.get(t.family) ?? { files: 0, tris: 0, bytes: 0 }
  byFamily.set(t.family, { files: fam.files + 1, tris: fam.tris + i.tris, bytes: fam.bytes + i.bytes })
  if (i.rootCount !== 1 || i.rootName !== name) err(r, `root node must be the single node "${name}" (found ${i.rootName})`)
  if (i.tris > TRI_BUDGET[t.budget]) err(r, `${i.tris} tris > ${TRI_BUDGET[t.budget]} (${t.budget})`)
  if (i.bytes > MAX_FILE) err(r, `${i.bytes} bytes > 1.5 MB`)
  for (const m of i.materials) if (!ALLOWED_MATERIALS.includes(m)) err(r, `foreign material ${m}`)
  const hasFace = i.materials.includes('M_Face')
  const maxTextures = hasFace ? 2 : 1
  if (i.textures.length > maxTextures) err(r, `${i.textures.length} textures (max ${maxTextures} allowed)`)
  for (const tx of i.textures) {
    const [tw, th] = tx.size ?? []
    const ok256 = tw === 256 && th === 256
    const ok512 = hasFace && tw === 512 && th === 512
    if (!ok256 && !ok512) {
      err(r, `embedded texture size ${tw}x${th} not allowed (expected 256x256 palette${hasFace ? ' or 512x512 face_atlas' : ''})`)
    }
  }
  if (i.maxUvSets > 1) err(r, 'more than one UV set')
  if (i.noVertexColor.length) {
    err(r, `${i.noVertexColor.length} of ${i.primitives} primitive(s) have no COLOR_0 (baked AO) in mesh ${[...new Set(i.noVertexColor)].join(', ')}; rebuild with npm run assets:all`)
  }
  if (i.hasExtraWeights) err(r, 'more than 4 bone influences per vertex (JOINTS_1/WEIGHTS_1 present)')
  if (i.invalidWeightSums > 0) err(r, `${i.invalidWeightSums} vertex skin weight sum(s) invalid`)
  if (rig && i.skins.length) {
    for (const skin of i.skins) {
      const sameLen = skin.joints.length === rig.bones.length
      const sameOrder = sameLen && skin.joints.every((jn, idx) => jn === rig.bones[idx])
      if (!sameOrder) {
        err(r, `skin "${skin.name}" joints (${skin.joints.length}) do not match art/rig.json bones (${rig.bones.length}) order`)
      }
    }
  }
  if (rig && i.morphTargetSets.length) {
    for (const mt of i.morphTargetSets) {
      const sameKeys = mt.names.length === rig.shapeKeys.length && mt.names.every((k, idx) => k === rig.shapeKeys[idx])
      if (!sameKeys) {
        err(r, `mesh "${mt.mesh}" morph targets [${mt.names.join(',')}] do not match rig.shapeKeys [${rig.shapeKeys.join(',')}]`)
      }
    }
  }
  if (name === 'body_female' || name === 'body_male') {
    if (i.skins.length !== 1) err(r, `body model must have exactly 1 skin (found ${i.skins.length})`)
    if (!i.materials.includes('M_Palette') || !i.materials.includes('M_Face')) {
      err(r, `body model must include both M_Palette and M_Face (found ${i.materials.join(', ')})`)
    }
    if (!i.morphTargetSets.length) err(r, 'body model has no morph targets')
  }
  for (const kind of t.anchors) {
    const isAnchor = i.anchors.some((a) => a.kind === kind)
    if (!isAnchor && !i.nodes.includes(kind)) err(r, `missing required anchor/node "${kind}"`)
  }
  for (const node of t.nodes ?? []) if (!i.nodes.includes(node)) err(r, `missing required node "${node}"`)
  const m = manifest[name]
  if (!m || m.tris !== i.tris || m.bytes !== i.bytes) err(r, 'manifest.json is stale (run npm run assets:manifest)')
}
for (const name of Object.keys(manifest)) if (!glbs.some((f) => basename(f, '.glb') === name)) err('manifest.json', `lists missing file ${name}`)
if (strict) for (const t of targets.values()) if (!existsSync(join(ROOT, t.out))) err(t.out, 'target has no output file')

// licence ledger: every shipped file has exactly one credit, and no orphan credits
const credits = JSON.parse(readFileSync(join(ASSETS_DIR, 'credits.json'), 'utf8')).assets
const licences = readFileSync(join(ROOT, 'art', 'LICENSES.md'), 'utf8')
const ALLOWED_LICENCES = ['CC0-1.0', 'CC-BY-4.0', 'OFL-1.1', 'own-CC0']
const licenceFiles = new Set(credits.map((c) => c.licenseFile).filter(Boolean))
const shipped = walk(ASSETS_DIR).map((f) => rel(f).replace(/^public\//, ''))
  .filter((p) => !['assets/manifest.json', 'assets/credits.json'].includes(p) && !licenceFiles.has(p) && !p.endsWith('.DS_Store'))
for (const p of shipped) {
  const rows = credits.filter((c) => c.path === p)
  if (rows.length !== 1) { err('public/' + p, `has ${rows.length} credit rows in credits.json (need exactly 1)`); continue }
  if (!ALLOWED_LICENCES.includes(rows[0].license)) err('public/' + p, `licence ${rows[0].license} is not allowed`)
  if (rows[0].sha256 !== sha256(join(ROOT, 'public', p))) err('public/' + p, 'sha256 differs from credits.json (run npm run assets:credits)')
  if (!licences.includes('`public/' + p + '`')) err('public/' + p, 'no row in art/LICENSES.md')
}
for (const c of credits) if (!shipped.includes(c.path)) err('credits.json', `orphan credit for ${c.path}`)

const kb = (n) => (n / 1024).toFixed(1).padStart(8) + ' KB'
console.log('family               files     tris       bytes')
for (const [f, s] of [...byFamily].sort()) console.log(`${f.padEnd(20)} ${String(s.files).padStart(5)} ${String(s.tris).padStart(8)} ${kb(s.bytes)}`)
const all = walk(ASSETS_DIR)
for (const g of GROUP_BUDGET) {
  const bytes = all.filter((f) => g.dirs.some((d) => rel(f).startsWith('public/assets/' + d + '/'))).reduce((a, f) => a + readFileSync(f).length, 0)
  console.log(`${g.label.padEnd(26)} ${kb(bytes)} / ${kb(g.max)}`)
  if (bytes > g.max) err(g.label, 'over size budget')
}
const total = all.reduce((a, f) => a + readFileSync(f).length, 0)
console.log(`${'public/assets total'.padEnd(26)} ${kb(total)} / ${kb(30 * 1024 * 1024)}`)
if (total > 30 * 1024 * 1024) err('public/assets', 'over 30 MB')

if (errors.length) {
  console.error(`\nassets:check FAILED (${errors.length})`)
  for (const e of errors) console.error('  ✗ ' + e)
  process.exit(1)
}
console.log(`\nassets:check OK (${glbs.length} models${strict ? ', strict' : ''})`)

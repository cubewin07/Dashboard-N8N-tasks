// gltf-transform pass: art/.cache/raw/**.glb -> public/assets/models/**.glb
// dedup, prune (anchors kept), weld, quantize + meshopt (no Draco; assets.md §3).
//   node scripts/assets-optimize.mjs [name ...]      (no names = everything in the raw cache)
import { mkdirSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import { createIO, MODELS_DIR, RAW_DIR, rel, walk } from './lib/assets.mjs'

const names = new Set(process.argv.slice(2))
const io = await createIO()
let n = 0
for (const file of walk(RAW_DIR).filter((f) => f.endsWith('.glb'))) {
  if (names.size && !names.has(basename(file, '.glb'))) continue
  const out = join(MODELS_DIR, relative(RAW_DIR, file))
  const doc = await io.read(file)
  await doc.transform(dedup(), prune({ keepLeaves: true }), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  doc.getRoot().getAsset().generator = 'AI Office art pipeline'
  mkdirSync(dirname(out), { recursive: true })
  await io.write(out, doc)
  n++
  if (names.size) console.log('optimized ' + rel(out))
}
if (names.size && n !== names.size) {
  console.error(`only ${n} of ${names.size} requested models exist in the raw cache`)
  process.exit(1)
}
console.log(`optimized ${n} file(s)`)

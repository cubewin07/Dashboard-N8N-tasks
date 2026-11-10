// Rebuilds public/assets/manifest.json: per GLB { tris, bytes, bbox, footprint, anchors, nodes }
// so layout code never parses GLBs to find seats (assets.md §1.5).
import { writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { ASSETS_DIR, createIO, inspectGlb, MODELS_DIR, walk } from './lib/assets.mjs'

const io = await createIO()
const files = {}
for (const file of walk(MODELS_DIR).filter((f) => f.endsWith('.glb'))) {
  const i = await inspectGlb(io, file)
  files[basename(file, '.glb')] = {
    file: relative(ASSETS_DIR, file).split('\\').join('/'),
    tris: i.tris, bytes: i.bytes, bbox: i.bbox, footprint: i.footprint, anchors: i.anchors, nodes: i.nodes,
  }
}
const body = Object.entries(files).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')
writeFileSync(join(ASSETS_DIR, 'manifest.json'), `{\n  "version": 1,\n  "files": {\n${body}\n  }\n}\n`)
console.log(`manifest: ${Object.keys(files).length} model(s)`)

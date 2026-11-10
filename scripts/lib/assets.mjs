// Shared helpers for the asset tooling (docs/plan/assets.md §3).
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const RAW_DIR = join(ROOT, 'art', '.cache', 'raw')
export const ASSETS_DIR = join(ROOT, 'public', 'assets')
export const MODELS_DIR = join(ASSETS_DIR, 'models')
export const BLENDER = process.env.BLENDER_BIN ?? '/Applications/Blender.app/Contents/MacOS/Blender'
export const ALLOWED_MATERIALS = ['M_Palette', 'M_Glass', 'M_Emissive', 'M_Face']
export const TRI_BUDGET = { small: 150, furniture: 1000, large: 3000, kit: 400, body: 3000, garment: 1500, hair: 1500, accessory: 400 }
export const ANCHOR_KINDS = ['seat', 'stand', 'pile', 'hand_r']

export async function createIO() {
  await MeshoptDecoder.ready
  await MeshoptEncoder.ready
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
}

export function loadTargets() {
  const p = join(ROOT, 'art', 'targets.json')
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).targets : []
}

export function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

export const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
export const rel = (p) => relative(ROOT, p).split('\\').join('/')
const r3 = (n) => Math.round(n * 1000) / 1000

/** Everything the manifest and the checks need to know about one GLB. */
export async function inspectGlb(io, file) {
  const doc = await io.read(file)
  const root = doc.getRoot()
  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  let tris = 0
  let maxUvSets = 0
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices()
      const pos = prim.getAttribute('POSITION')
      tris += (idx ? idx.getCount() : pos.getCount()) / 3
      maxUvSets = Math.max(maxUvSets, prim.listSemantics().filter((s) => s.startsWith('TEXCOORD_')).length)
    }
  }
  const rootNodes = scene.listChildren()
  const rootName = rootNodes.length === 1 ? rootNodes[0].getName() : null
  const anchors = []
  const nodes = []
  scene.traverse((node) => {
    const name = node.getName()
    if (name === rootName) return
    const isLeafEmpty = !node.getMesh() && node.listChildren().length === 0
    const short = rootName && name.startsWith(rootName + '_') ? name.slice(rootName.length + 1) : name
    if (isLeafEmpty) {
      const m = short.match(/^(.*?)(?:_(\d+))?$/)
      const kind = ANCHOR_KINDS.includes(short) ? short : m[1]
      const t = node.getWorldTranslation()
      const q = node.getWorldRotation()
      const rotY = Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] * q[1] + q[0] * q[0]))
      anchors.push({ kind, pos: t.map(r3), rotY: r3(rotY) })
    } else if (!short.endsWith('_mesh') && short !== 'mesh') {
      nodes.push(short)
    }
  })
  const b = getBounds(scene)
  const snap = (v) => Math.max(0.5, Math.ceil((v - 0.02) / 0.5) * 0.5)
  return {
    tris,
    bytes: statSync(file).size,
    bbox: { min: b.min.map(r3), max: b.max.map(r3) },
    footprint: [snap(b.max[0] - b.min[0]), snap(b.max[2] - b.min[2])],
    anchors,
    nodes: nodes.sort(),
    rootName,
    rootCount: rootNodes.length,
    materials: root.listMaterials().map((m) => m.getName()),
    textures: root.listTextures().map((t) => ({ name: t.getName(), size: t.getSize(), bytes: t.getImage()?.byteLength ?? 0 })),
    maxUvSets,
  }
}

// gltf-transform pass: art/.cache/raw/**.glb -> public/assets/models/**.glb
// dedup, prune (anchors kept), weld, quantize + meshopt (no Draco; assets.md §3).
// Characters & wardrobe preserve skins (reordered to art/rig.json), morph target names/accuracy (<0.5 mm),
// COLOR_0, and unquantized metric positions so IBM & assembly stay in exact metres.
//   node scripts/assets-optimize.mjs [name ...]      (no names = everything in the raw cache)
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { EXTMeshoptCompression } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, quantize, reorder, weld } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import { createIO, MODELS_DIR, RAW_DIR, rel, ROOT, walk } from './lib/assets.mjs'

function loadRigBones() {
  const rigPath = join(ROOT, 'art', 'rig.json')
  if (!existsSync(rigPath)) return null
  return JSON.parse(readFileSync(rigPath, 'utf8')).bones
}

/** Reorder skin joints, inverseBindMatrices, and JOINTS_0 indices to match rig.json order. */
function reorderSkinsToRig(doc, rigBones) {
  if (!rigBones) return
  const root = doc.getRoot()
  for (const skin of root.listSkins()) {
    const oldJoints = skin.listJoints()
    if (oldJoints.length !== rigBones.length) continue
    const byName = new Map(oldJoints.map((j, idx) => [j.getName(), { node: j, oldIdx: idx }]))
    if (!rigBones.every((b) => byName.has(b))) continue
    const alreadyOrdered = oldJoints.every((j, idx) => j.getName() === rigBones[idx])
    if (alreadyOrdered) continue

    const oldToNew = new Map()
    const newOrder = rigBones.map((name, newIdx) => {
      const entry = byName.get(name)
      oldToNew.set(entry.oldIdx, newIdx)
      return entry
    })

    // Reorder joints on the skin
    for (const j of oldJoints) skin.removeJoint(j)
    for (const entry of newOrder) skin.addJoint(entry.node)

    // Reorder inverseBindMatrices
    const ibm = skin.getInverseBindMatrices()
    if (ibm) {
      const oldArr = ibm.getArray()
      const newArr = new oldArr.constructor(oldArr.length)
      for (let newIdx = 0; newIdx < newOrder.length; newIdx++) {
        const srcOff = newOrder[newIdx].oldIdx * 16
        const dstOff = newIdx * 16
        newArr.set(oldArr.subarray(srcOff, srcOff + 16), dstOff)
      }
      ibm.setArray(newArr)
    }

    // Remap JOINTS_0 on every primitive referencing this skin
    const nodesUsingSkin = root.listNodes().filter((n) => n.getSkin() === skin && n.getMesh())
    for (const node of nodesUsingSkin) {
      for (const prim of node.getMesh().listPrimitives()) {
        const jointsAttr = prim.getAttribute('JOINTS_0')
        if (!jointsAttr) continue
        const el = [0, 0, 0, 0]
        for (let i = 0; i < jointsAttr.getCount(); i++) {
          jointsAttr.getElement(i, el)
          jointsAttr.setElement(i, el.map((j) => oldToNew.get(j) ?? j))
        }
      }
    }
  }
}

/** Measure max morph-target POSITION delta error (in metres) between raw and optimized doc. */
function maxMorphDeltaError(rawDoc, optDoc) {
  const rawPrims = rawDoc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
  const optPrims = optDoc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
  if (rawPrims.length !== optPrims.length) return 0
  let maxErr = 0
  for (let pi = 0; pi < optPrims.length; pi++) {
    const rp = rawPrims[pi]
    const op = optPrims[pi]
    const rPos = rp.getAttribute('POSITION')
    const oPos = op.getAttribute('POSITION')
    const rTargets = rp.listTargets()
    const oTargets = op.listTargets()
    if (rTargets.length !== oTargets.length) {
      throw new Error(`morph target count changed (${rTargets.length} -> ${oTargets.length})`)
    }
    if (!oTargets.length) continue

    // Index raw vertices by quantized position key for fast O(1) lookup after weld/reorder
    const rawMap = new Map()
    const p = [0, 0, 0]
    for (let j = 0; j < rPos.getCount(); j++) {
      rPos.getElement(j, p)
      const key = `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)},${Math.round(p[2] * 1e5)}`
      if (!rawMap.has(key)) rawMap.set(key, j)
    }
    const rEl = [0, 0, 0]
    const oEl = [0, 0, 0]
    for (let ti = 0; ti < oTargets.length; ti++) {
      const rT = rTargets[ti].getAttribute('POSITION')
      const oT = oTargets[ti].getAttribute('POSITION')
      if (!rT || !oT) continue
      for (let i = 0; i < oPos.getCount(); i++) {
        oPos.getElement(i, p)
        const key = `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)},${Math.round(p[2] * 1e5)}`
        const rIdx = rawMap.get(key)
        if (rIdx === undefined) continue
        rT.getElement(rIdx, rEl)
        oT.getElement(i, oEl)
        const err = Math.hypot(oEl[0] - rEl[0], oEl[1] - rEl[1], oEl[2] - rEl[2])
        if (err > maxErr) maxErr = err
      }
    }
  }
  return maxErr
}

const names = new Set(process.argv.slice(2))
const rigBones = loadRigBones()
const io = await createIO()
let n = 0
for (const file of walk(RAW_DIR).filter((f) => f.endsWith('.glb'))) {
  if (names.size && !names.has(basename(file, '.glb'))) continue
  const relPath = relative(RAW_DIR, file).split('\\').join('/')
  const out = join(MODELS_DIR, relPath)
  const isChar = relPath.startsWith('characters/') || relPath.startsWith('wardrobe/')
  const doc = await io.read(file)
  if (isChar) {
    const rawDoc = await io.read(file)
    reorderSkinsToRig(doc, rigBones)
    await doc.transform(
      dedup(),
      prune({ keepLeaves: true }),
      weld(),
      reorder({ encoder: MeshoptEncoder, target: 'size' }),
      quantize({
        // Keep POSITION & morph target POSITION in unquantized metres so body + garments share IBM
        pattern: /^(?!POSITION$).*/,
        patternTargets: /^(?!POSITION$).*/,
        quantizeNormal: 12,
        quantizeTexcoord: 14,
        quantizeColor: 8,
        quantizeWeight: 10,
      }),
    )
    doc.createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER })
    const errMm = maxMorphDeltaError(rawDoc, doc) * 1000
    if (errMm >= 0.5) {
      throw new Error(`${relPath}: morph delta error ${errMm.toFixed(4)} mm >= 0.5 mm`)
    }
  } else {
    await doc.transform(dedup(), prune({ keepLeaves: true }), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  }
  doc.getRoot().getAsset().generator = 'AI Office art pipeline'
  mkdirSync(dirname(out), { recursive: true })
  await io.write(out, doc)
  n++
  if (names.size) console.log('optimized ' + rel(out))
}

// Copy .meta.json sidecars (e.g. body.meta.json, <item>.meta.json) when present in RAW_DIR
for (const meta of walk(RAW_DIR).filter((f) => f.endsWith('.meta.json'))) {
  const relPath = relative(RAW_DIR, meta).split('\\').join('/')
  if (names.size) {
    const dir = dirname(relPath)
    const stem = basename(meta, '.meta.json')
    const matches = [...names].some((nm) => nm === stem || nm.startsWith(stem + '_'))
    if (!matches && !(stem === 'body' && [...names].some((nm) => nm.startsWith('body_')))) continue
  }
  const outMeta = join(MODELS_DIR, relPath)
  mkdirSync(dirname(outMeta), { recursive: true })
  copyFileSync(meta, outMeta)
}

if (names.size && n !== names.size) {
  console.error(`only ${n} of ${names.size} requested models exist in the raw cache`)
  process.exit(1)
}
console.log(`optimized ${n} file(s)`)

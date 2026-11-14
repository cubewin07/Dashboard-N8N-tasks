// Optimizes (with --optimize) and validates public/assets/anim/library.{glb,json} (P07a-T06).
//   node scripts/anim-check.mjs [--optimize]
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { dedup, resample } from '@gltf-transform/functions'
import { createIO, RAW_DIR, ROOT } from './lib/assets.mjs'

const EXPECTED_CLIPS = [
  'idle',
  'walk',
  'carry_walk',
  'sit_idle',
  'sit_type',
  'sit_read',
  'sit_phone',
  'stand_talk_a',
  'stand_talk_b',
  'wave',
  'think',
  'drink',
  'sleep_desk',
  'sleep_bed',
  'sofa_sit',
  'pingpong',
  'arcade',
  'karaoke',
  'elevator_wait',
  'celebrate',
  'frustrated',
]

// Fallback copied from art/blender/lib/rig.py BONE_NAMES (used when art/rig.json does not exist yet)
const FALLBACK_BONE_NAMES = [
  'Root', 'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandGrip',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandGrip',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
  'Attach_Head', 'Attach_Neck', 'Attach_Back', 'Attach_HandL', 'Attach_HandR', 'Attach_WristL',
]

const DEFORM_BONES = new Set(
  FALLBACK_BONE_NAMES.filter((n) => n !== 'Root' && !n.startsWith('Attach_')),
)

const MAX_BYTES = 1.2 * 1024 * 1024
const RAW_GLB = join(RAW_DIR, 'anim', 'library.glb')
const RAW_JSON = join(RAW_DIR, 'anim', 'library.json')
const OUT_GLB = join(ROOT, 'public', 'assets', 'anim', 'library.glb')
const OUT_JSON = join(ROOT, 'public', 'assets', 'anim', 'library.json')

function quatAngleDeg(a, b) {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI
}

function isConstantAccessor(acc, tol = 1e-5) {
  const n = acc.getCount()
  if (n <= 2) return false
  const size = acc.getElementSize()
  const first = new Array(size)
  const cur = new Array(size)
  acc.getElement(0, first)
  for (let i = 1; i < n; i++) {
    acc.getElement(i, cur)
    for (let j = 0; j < size; j++) {
      if (Math.abs(cur[j] - first[j]) > tol) return false
    }
  }
  return true
}

async function optimizeLibrary(io) {
  if (!existsSync(RAW_GLB)) {
    throw new Error(`Missing raw GLB: ${RAW_GLB}. Run "npm run art:build -- anims" first.`)
  }
  const doc = await io.read(RAW_GLB)
  const root = doc.getRoot()

  for (const anim of root.listAnimations()) {
    for (const ch of [...anim.listChannels()]) {
      const target = ch.getTargetNode()?.getName() ?? ''
      const path = ch.getTargetPath()
      const keep =
        (path === 'rotation' && DEFORM_BONES.has(target)) ||
        (path === 'translation' && target === 'Hips')
      if (!keep) {
        ch.dispose()
      }
    }
    // Collapse constant channels to [0, duration] so crossfades still reset all deform bones
    for (const ch of anim.listChannels()) {
      const sampler = ch.getSampler()
      if (!sampler) continue
      const inp = sampler.getInput()
      const out = sampler.getOutput()
      if (!inp || !out || !isConstantAccessor(out)) continue
      const n = inp.getCount()
      const t0 = inp.getScalar(0)
      const t1 = inp.getScalar(n - 1)
      const v0 = new Array(out.getElementSize())
      out.getElement(0, v0)
      const newInp = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([t0, t1]))
      const newOut = doc
        .createAccessor()
        .setType(out.getType())
        .setArray(new Float32Array([...v0, ...v0]))
      sampler.setInput(newInp).setOutput(newOut)
    }
  }

  // Prune orphaned samplers/accessors manually without touching skeleton leaf nodes
  const usedSamplers = new Set()
  const usedAccessors = new Set()
  for (const anim of root.listAnimations()) {
    for (const ch of anim.listChannels()) {
      const s = ch.getSampler()
      if (s) {
        usedSamplers.add(s)
        if (s.getInput()) usedAccessors.add(s.getInput())
        if (s.getOutput()) usedAccessors.add(s.getOutput())
      }
    }
    for (const s of [...anim.listSamplers()]) {
      if (!usedSamplers.has(s)) s.dispose()
    }
  }
  for (const acc of [...root.listAccessors()]) {
    if (!usedAccessors.has(acc)) acc.dispose()
  }

  await doc.transform(resample({ tolerance: 1e-4 }), dedup())
  root.getAsset().generator = 'AI Office art pipeline'
  mkdirSync(dirname(OUT_GLB), { recursive: true })
  await io.write(OUT_GLB, doc)

  if (existsSync(RAW_JSON)) {
    copyFileSync(RAW_JSON, OUT_JSON)
  }
  console.log(`Optimized -> ${OUT_GLB} (${statSync(OUT_GLB).size} bytes)`)
}

function loadExpectedBones() {
  const rigPath = join(ROOT, 'art', 'rig.json')
  if (existsSync(rigPath)) {
    const data = JSON.parse(readFileSync(rigPath, 'utf8'))
    const bones = Array.isArray(data) ? data : data.bones ?? data.boneNames
    if (Array.isArray(bones) && bones.length > 0) {
      return { bones: bones.map((b) => (typeof b === 'string' ? b : b.name)), source: 'art/rig.json' }
    }
  }
  return { bones: FALLBACK_BONE_NAMES, source: 'hard-coded fallback from art/blender/lib/rig.py (art/rig.json not found)' }
}

async function main() {
  const io = await createIO()
  if (process.argv.includes('--optimize')) {
    await optimizeLibrary(io)
  }

  const errors = []
  const err = (msg) => errors.push(msg)

  if (!existsSync(OUT_GLB)) err(`missing ${OUT_GLB}`)
  if (!existsSync(OUT_JSON)) err(`missing ${OUT_JSON}`)
  if (errors.length) {
    for (const e of errors) console.error('✗ ' + e)
    process.exit(1)
  }

  const bytes = statSync(OUT_GLB).size
  if (bytes > MAX_BYTES) err(`library.glb size ${bytes} bytes > ${MAX_BYTES}`)

  const doc = await io.read(OUT_GLB)
  const root = doc.getRoot()
  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  if (!scene) {
    err('no default scene in library.glb')
  } else {
    const children = scene.listChildren()
    if (children.length !== 1 || children[0].getName() !== 'library') {
      err(`root node must be single node "library" (got: ${children.map((c) => c.getName()).join(', ')})`)
    }
  }

  if (root.listMeshes().length !== 0) {
    err(`expected skeleton-only GLB (0 meshes), found ${root.listMeshes().length}`)
  }

  const { bones: expectedBones, source: boneSource } = loadExpectedBones()
  const nodeNames = new Set(root.listNodes().map((n) => n.getName()))
  for (const b of expectedBones) {
    if (!nodeNames.has(b)) err(`missing bone "${b}"`)
  }
  for (const n of nodeNames) {
    if (n !== 'library' && !expectedBones.includes(n)) err(`unexpected node "${n}"`)
  }

  const metaJson = JSON.parse(readFileSync(OUT_JSON, 'utf8'))
  const metaMap = new Map((metaJson.clips ?? []).map((c) => [c.clip, c]))
  const anims = root.listAnimations()
  const animMap = new Map(anims.map((a) => [a.getName(), a]))

  if (anims.length !== animMap.size) err('duplicate animation names in library.glb')
  for (const clipName of EXPECTED_CLIPS) {
    if (!animMap.has(clipName)) err(`missing clip "${clipName}" in library.glb`)
    if (!metaMap.has(clipName)) err(`missing clip "${clipName}" in library.json`)
  }
  for (const a of anims) {
    if (!EXPECTED_CLIPS.includes(a.getName())) err(`extra clip "${a.getName()}" in library.glb`)
  }
  for (const k of metaMap.keys()) {
    if (!EXPECTED_CLIPS.includes(k)) err(`extra clip "${k}" in library.json`)
  }

  console.log(`Bones source: ${boneSource} (${expectedBones.length} bones)`)
  console.log(`File size: ${(bytes / 1024).toFixed(1)} KB / ${(MAX_BYTES / 1024).toFixed(0)} KB`)
  console.log('')
  console.log('clip            loop   dur(s)   chs  maxKeys  loopDelta(deg)  status')
  console.log('--------------  -----  ------  ----  -------  --------------  ------')

  for (const name of EXPECTED_CLIPS) {
    const a = animMap.get(name)
    const m = metaMap.get(name)
    if (!a) continue
    let maxKeys = 0
    let maxDur = 0
    let maxDeg = 0
    let clipOk = true

    for (const ch of a.listChannels()) {
      const target = ch.getTargetNode()?.getName() ?? ''
      const path = ch.getTargetPath()
      if (target === 'Root') {
        err(`${name}: Root has animated channel (${path})`)
        clipOk = false
      }
      if (path === 'scale') {
        err(`${name}: disallowed scale channel on ${target}`)
        clipOk = false
      }
      if (path === 'translation' && target !== 'Hips') {
        err(`${name}: disallowed translation channel on ${target}`)
        clipOk = false
      }
      const sampler = ch.getSampler()
      const inp = sampler?.getInput()
      const out = sampler?.getOutput()
      if (!inp || !out) continue
      const count = inp.getCount()
      maxKeys = Math.max(maxKeys, count)
      maxDur = Math.max(maxDur, inp.getScalar(count - 1))
      if (path === 'rotation' && count >= 2) {
        const q0 = [0, 0, 0, 1]
        const q1 = [0, 0, 0, 1]
        out.getElement(0, q0)
        out.getElement(count - 1, q1)
        const deg = quatAngleDeg(q0, q1)
        maxDeg = Math.max(maxDeg, deg)
        if (deg > 1.0) {
          err(`${name}: ${target} first/last key differ by ${deg.toFixed(2)} deg (> 1.0 deg)`)
          clipOk = false
        }
      }
      if (path === 'translation' && target === 'Hips' && count >= 2) {
        const p0 = [0, 0, 0]
        const p1 = [0, 0, 0]
        out.getElement(0, p0)
        out.getElement(count - 1, p1)
        const dist = Math.hypot(p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2])
        if (dist > 0.005) {
          err(`${name}: Hips translation first/last differ by ${dist.toFixed(4)} m`)
          clipOk = false
        }
      }
    }

    if (m && Math.abs(m.duration - maxDur) > 0.02) {
      err(`${name}: library.json duration ${m.duration} != glb ${maxDur.toFixed(3)}`)
      clipOk = false
    }

    const loopStr = m ? (m.loop ? 'yes' : 'no') : '?'
    console.log(
      `${name.padEnd(14)}  ${loopStr.padEnd(5)}  ${maxDur.toFixed(2).padStart(6)}  ${String(a.listChannels().length).padStart(4)}  ${String(maxKeys).padStart(7)}  ${maxDeg.toFixed(3).padStart(14)}  ${clipOk ? 'OK' : 'FAIL'}`,
    )
  }

  if (errors.length) {
    console.error(`\nanim-check FAILED (${errors.length}):`)
    for (const e of errors) console.error('  ✗ ' + e)
    process.exit(1)
  }
  console.log(`\nanim-check PASSED (${EXPECTED_CLIPS.length} clips, ${(bytes / 1024).toFixed(1)} KB)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

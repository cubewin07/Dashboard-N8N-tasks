import fs from 'node:fs'
import path from 'node:path'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'meshoptimizer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POSE_KEYS } from '@/scene/director/poses'
import {
  CLIP_META,
  clearAnimLibraryCache,
  loadAnimLibrary,
  resetUnknownActionWarnings,
  resolveActionClip,
  seatYOffset,
  type AnimLibraryJson,
} from '../animLibrary'

const LIBRARY_JSON_PATH = path.resolve(process.cwd(), 'public/assets/anim/library.json')
const LIBRARY_GLB_PATH = path.resolve(process.cwd(), 'public/assets/anim/library.glb')

function readLibraryJson(): AnimLibraryJson {
  return JSON.parse(fs.readFileSync(LIBRARY_JSON_PATH, 'utf8')) as AnimLibraryJson
}

describe('animLibrary', () => {
  beforeEach(() => {
    clearAnimLibraryCache()
    resetUnknownActionWarnings()
  })

  afterEach(() => {
    clearAnimLibraryCache()
    resetUnknownActionWarnings()
    vi.restoreAllMocks()
  })

  it('CLIP_META matches every clip entry in public/assets/anim/library.json', () => {
    const json = readLibraryJson()
    expect(json.clips.length).toBeGreaterThan(0)
    for (const entry of json.clips) {
      const meta = CLIP_META[entry.clip]
      expect(meta, `Missing CLIP_META for "${entry.clip}"`).toBeDefined()
      expect(meta!.loop).toBe(entry.loop)
      expect(meta!.duration).toBe(entry.duration)
      expect(meta!.speedMps).toBe(entry.speedMps)
      expect(meta!.seated).toBe(entry.seated)
      expect(meta!.eyes).toBe(entry.eyes)
    }
  })

  it('resolves every PoseKey in POSE_KEYS and every §3.5 action to a clip in library.json', () => {
    const json = readLibraryJson()
    const validClips = new Set(json.clips.map((c) => c.clip))

    for (const pose of POSE_KEYS) {
      const res = resolveActionClip(pose, { carrying: null, speed: 1.3, personSeed: 7 })
      expect(validClips.has(res.clip), `Pose "${pose}" resolved to missing clip "${res.clip}"`).toBe(true)
    }

    const extraActions = [
      'idle_stand',
      'sit_idle',
      'sit_type',
      'review',
      'coffee_drink',
      'tea_sit',
      'sofa_sit',
      'sleep_desk',
      'wave',
      'massage',
      'celebrate',
      'blocked',
      'frustrated',
      'think',
      'drink',
      'pingpong',
      'arcade',
      'elevator_wait',
    ]

    for (const action of extraActions) {
      const res = resolveActionClip(action, { carrying: null, speed: 1.3, personSeed: 3 })
      expect(validClips.has(res.clip), `Action "${action}" resolved to missing clip "${res.clip}"`).toBe(true)
    }
  })

  it('handles carrying variants, talk alternation, one-shots, and closed/happy eyes', () => {
    expect(resolveActionClip('walk', { carrying: null }).clip).toBe('walk')
    expect(resolveActionClip('walk', { carrying: 'document' }).clip).toBe('carry_walk')

    expect(resolveActionClip('sit_work', { carrying: 'laptop' }).clip).toBe('sit_type')
    expect(resolveActionClip('sit_work', { carrying: 'document' }).clip).toBe('sit_read')
    expect(resolveActionClip('sit_work', { carrying: 'phone' }).clip).toBe('sit_phone')
    expect(resolveActionClip('sit_work', { carrying: null }).clip).toBe('sit_type')

    expect(resolveActionClip('talk', { personSeed: 0 }).clip).toBe('stand_talk_a')
    expect(resolveActionClip('talk', { personSeed: 1 }).clip).toBe('stand_talk_b')

    expect(resolveActionClip('tea', { seated: false }).clip).toBe('drink')
    expect(resolveActionClip('tea', { seated: true }).clip).toBe('sit_idle')
    expect(resolveActionClip('tea_sit').clip).toBe('sit_idle')

    const nap = resolveActionClip('nap_desk')
    expect(nap.clip).toBe('sleep_desk')
    expect(nap.eyes).toBe('closed')

    const bed = resolveActionClip('sleep_bed')
    expect(bed.clip).toBe('sleep_bed')
    expect(bed.eyes).toBe('closed')

    const done = resolveActionClip('done')
    expect(done.clip).toBe('celebrate')
    expect(done.loop).toBe(false)
    expect(done.oneShotPrev).toBe(true)
    expect(done.eyes).toBe('happy')

    const blocked = resolveActionClip('blocked')
    expect(blocked.clip).toBe('frustrated')
    expect(blocked.loop).toBe(false)
    expect(blocked.oneShotPrev).toBe(true)

    const greet = resolveActionClip('greet')
    expect(greet.clip).toBe('wave')
    expect(greet.loop).toBe(false)
    expect(greet.oneShotPrev).toBe(true)
  })

  it('computes walk timeScale from speed or speed01 vs clip speedMps', () => {
    expect(resolveActionClip('walk', { speed: 1.3 }).timeScale).toBeCloseTo(1.0)
    expect(resolveActionClip('walk', { speed: 2.6 }).timeScale).toBeCloseTo(2.0)
    expect(resolveActionClip('walk', { speed: 0.65, carrying: 'box' }).timeScale).toBeCloseTo(0.5)
    expect(resolveActionClip('walk', { speed01: 0.5 }).timeScale).toBeCloseTo(0.5)
    expect(resolveActionClip('walk', { speed: 0 }).timeScale).toBe(0)
  })

  it('falls back to idle for unknown actions and warns once per unknown key in dev', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const first = resolveActionClip('future_action_xyz')
    const second = resolveActionClip('future_action_xyz')
    expect(first.clip).toBe('idle')
    expect(second.clip).toBe('idle')
    expect(warnSpy).toHaveBeenCalledTimes(1)

    resolveActionClip('another_unknown_pose')
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  it('compensates seated/lying Y offset across heightScale 0.92..1.08 without moving standing feet', () => {
    expect(seatYOffset('idle', 0.92)).toBe(0)
    expect(seatYOffset('walk', 1.08)).toBe(0)

    // Chair seat 0.45 m: pelvis bottom stays at 0.45 m for short and tall people.
    for (const clip of ['sit_idle', 'sit_type', 'sit_read', 'sit_phone', 'sleep_desk']) {
      expect(seatYOffset(clip, 1.0)).toBe(0)
      const shortOffset = seatYOffset(clip, 0.92)
      const tallOffset = seatYOffset(clip, 1.08)
      expect(shortOffset).toBeCloseTo(0.036, 6)
      expect(tallOffset).toBeCloseTo(-0.036, 6)
      expect(0.45 * 0.92 + shortOffset).toBeCloseTo(0.45, 6)
      expect(0.45 * 1.08 + tallOffset).toBeCloseTo(0.45, 6)
    }

    // Sofa 0.42 m and bed 0.40 m.
    expect(0.42 * 0.92 + seatYOffset('sofa_sit', 0.92)).toBeCloseTo(0.42, 6)
    expect(0.40 * 1.08 + seatYOffset('sleep_bed', 1.08)).toBeCloseTo(0.4, 6)
  })

  it('loads and caches real library.glb + library.json once', async () => {
    await MeshoptDecoder.ready
    const gltfLoader = new GLTFLoader()
    gltfLoader.setMeshoptDecoder(MeshoptDecoder)

    const loadAsync = vi.fn(async () => {
      const buf = fs.readFileSync(LIBRARY_GLB_PATH)
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      return gltfLoader.parseAsync(ab, '')
    })
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => readLibraryJson(),
    }))

    const [a, b] = await Promise.all([
      loadAnimLibrary({ loader: { loadAsync }, fetchFn, baseUrl: '/' }),
      loadAnimLibrary({ loader: { loadAsync }, fetchFn, baseUrl: '/' }),
    ])

    expect(a).toBe(b)
    expect(loadAsync).toHaveBeenCalledTimes(1)
    expect(loadAsync).toHaveBeenCalledWith('/assets/anim/library.glb')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledWith('/assets/anim/library.json')
    expect(a.clips.size).toBe(21)
    expect(a.clips.has('walk')).toBe(true)
    expect(a.clips.has('sit_type')).toBe(true)
  })
})

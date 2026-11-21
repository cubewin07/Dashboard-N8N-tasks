import type * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { POSE_KEYS, type PoseKey } from '@/scene/director/poses'

export interface AnimClipMeta {
  clip: string
  loop: boolean
  duration: number
  speedMps?: number
  seated?: boolean
  eyes?: 'open' | 'closed' | 'happy'
  /** Surface height (m) at neutral scale 1.0 used to compensate seated/lying height scaling. */
  seatHeight?: number
}

export interface ActionClipResolution {
  clip: string
  timeScale: number
  loop: boolean
  eyes?: 'open' | 'closed' | 'happy'
  seatOffsetY: number
  oneShotPrev?: boolean
}

export interface ResolveActionClipOptions {
  carrying?: string | null
  speed?: number
  speed01?: number
  personSeed?: number
  heightScale?: number
  seated?: boolean
}

export interface AnimLibraryJson {
  clips: AnimClipMeta[]
}

export interface AnimLibraryData {
  clips: Map<string, THREE.AnimationClip>
  meta: Map<string, AnimClipMeta>
}

export interface AnimLibraryDeps {
  loader?: { loadAsync(url: string): Promise<GLTF> }
  fetchFn?: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
  baseUrl?: string
}

const WALK_DEFAULT_SPEED_MPS = 1.3
const CHAIR_SEAT_HEIGHT = 0.45
const SOFA_SEAT_HEIGHT = 0.42
const BED_MATTRESS_HEIGHT = 0.4

export const CLIP_META: Readonly<Record<string, AnimClipMeta>> = {
  idle: { clip: 'idle', loop: true, duration: 3.0 },
  walk: { clip: 'walk', loop: true, duration: 1.0, speedMps: 1.3 },
  carry_walk: { clip: 'carry_walk', loop: true, duration: 1.0, speedMps: 1.3 },
  sit_idle: { clip: 'sit_idle', loop: true, duration: 3.0, seated: true, seatHeight: CHAIR_SEAT_HEIGHT },
  sit_type: { clip: 'sit_type', loop: true, duration: 1.6, seated: true, seatHeight: CHAIR_SEAT_HEIGHT },
  sit_read: { clip: 'sit_read', loop: true, duration: 2.4, seated: true, seatHeight: CHAIR_SEAT_HEIGHT },
  sit_phone: { clip: 'sit_phone', loop: true, duration: 2.0, seated: true, seatHeight: CHAIR_SEAT_HEIGHT },
  stand_talk_a: { clip: 'stand_talk_a', loop: true, duration: 2.4 },
  stand_talk_b: { clip: 'stand_talk_b', loop: true, duration: 2.4 },
  wave: { clip: 'wave', loop: false, duration: 1.8 },
  think: { clip: 'think', loop: true, duration: 2.4 },
  drink: { clip: 'drink', loop: true, duration: 2.4 },
  sleep_desk: {
    clip: 'sleep_desk',
    loop: true,
    duration: 3.0,
    seated: true,
    eyes: 'closed',
    seatHeight: CHAIR_SEAT_HEIGHT,
  },
  sleep_bed: {
    clip: 'sleep_bed',
    loop: true,
    duration: 3.0,
    eyes: 'closed',
    seatHeight: BED_MATTRESS_HEIGHT,
  },
  sofa_sit: { clip: 'sofa_sit', loop: true, duration: 3.0, seated: true, seatHeight: SOFA_SEAT_HEIGHT },
  pingpong: { clip: 'pingpong', loop: true, duration: 1.6 },
  arcade: { clip: 'arcade', loop: true, duration: 1.6 },
  karaoke: { clip: 'karaoke', loop: true, duration: 2.0 },
  elevator_wait: { clip: 'elevator_wait', loop: true, duration: 3.0 },
  celebrate: { clip: 'celebrate', loop: false, duration: 1.8, eyes: 'happy' },
  frustrated: { clip: 'frustrated', loop: false, duration: 2.0 },
}

const SEAT_HEIGHT_BY_CLIP: Readonly<Record<string, number>> = {
  sit_idle: CHAIR_SEAT_HEIGHT,
  sit_type: CHAIR_SEAT_HEIGHT,
  sit_read: CHAIR_SEAT_HEIGHT,
  sit_phone: CHAIR_SEAT_HEIGHT,
  sleep_desk: CHAIR_SEAT_HEIGHT,
  sofa_sit: SOFA_SEAT_HEIGHT,
  sleep_bed: BED_MATTRESS_HEIGHT,
}

const ONE_SHOT_CLIPS = new Set<string>(['wave', 'celebrate', 'frustrated'])
const warnedUnknownActions = new Set<string>()

let libraryPromise: Promise<AnimLibraryData> | null = null
let libraryData: AnimLibraryData | null = null
let defaultLoader: GLTFLoader | null = null

function getDefaultLoader(): GLTFLoader {
  if (!defaultLoader) {
    defaultLoader = new GLTFLoader()
    defaultLoader.setMeshoptDecoder(MeshoptDecoder)
  }
  return defaultLoader
}

function animAssetUrl(relPath: string, baseUrl: string = import.meta.env.BASE_URL): string {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${cleanBase}assets/${relPath.replace(/^\/+/, '')}`
}

/** Load and cache `assets/anim/library.glb` and `assets/anim/library.json`. */
export async function loadAnimLibrary(deps?: AnimLibraryDeps): Promise<AnimLibraryData> {
  if (libraryData) return libraryData
  if (libraryPromise) return libraryPromise

  const loader = deps?.loader ?? getDefaultLoader()
  const fetchFn = deps?.fetchFn ?? ((url: string) => fetch(url))
  const glbUrl = animAssetUrl('anim/library.glb', deps?.baseUrl)
  const jsonUrl = animAssetUrl('anim/library.json', deps?.baseUrl)

  libraryPromise = Promise.all([
    loader.loadAsync(glbUrl),
    fetchFn(jsonUrl).then(async (res) => {
      if (!res.ok) throw new Error(`Failed to fetch "${jsonUrl}": HTTP ${res.status}`)
      return (await res.json()) as AnimLibraryJson
    }),
  ])
    .then(([gltf, json]) => {
      const clips = new Map<string, THREE.AnimationClip>()
      for (const clip of gltf.animations) {
        clips.set(clip.name, clip)
      }

      const meta = new Map<string, AnimClipMeta>()
      for (const entry of json.clips) {
        const seatHeight = SEAT_HEIGHT_BY_CLIP[entry.clip]
        meta.set(entry.clip, seatHeight !== undefined ? { ...entry, seatHeight } : entry)
      }
      for (const [key, fallback] of Object.entries(CLIP_META)) {
        if (!meta.has(key)) meta.set(key, fallback)
      }

      libraryData = { clips, meta }
      return libraryData
    })
    .catch((err: unknown) => {
      libraryPromise = null
      throw err
    })

  return libraryPromise
}

export function getAnimClip(clipName: string): THREE.AnimationClip | null {
  return libraryData?.clips.get(clipName) ?? null
}

export function getAnimClipMeta(clipName: string): AnimClipMeta | null {
  return libraryData?.meta.get(clipName) ?? CLIP_META[clipName] ?? null
}

export function clearAnimLibraryCache(): void {
  libraryPromise = null
  libraryData = null
}

export function resetUnknownActionWarnings(): void {
  warnedUnknownActions.clear()
}

/**
 * Vertical root offset (m) that keeps seated/lying characters aligned to the seat or mattress
 * when scaled by `heightScale` (0.92..1.08), without shifting standing feet off the floor.
 */
export function seatYOffset(clipName: string, heightScale: number): number {
  if (!Number.isFinite(heightScale)) return 0
  const seatHeight = SEAT_HEIGHT_BY_CLIP[clipName] ?? 0
  if (seatHeight === 0) return 0
  const offset = seatHeight * (1 - heightScale)
  return offset === 0 ? 0 : offset
}

function resolveWalkTimeScale(clipName: string, opts: ResolveActionClipOptions): number {
  const speedMps = getAnimClipMeta(clipName)?.speedMps ?? WALK_DEFAULT_SPEED_MPS
  if (opts.speed !== undefined) {
    return Math.max(0, opts.speed / speedMps)
  }
  if (opts.speed01 !== undefined) {
    return Math.max(0, (opts.speed01 * WALK_DEFAULT_SPEED_MPS) / speedMps)
  }
  return 1
}

function resolveSitWorkClip(carrying: string | null | undefined): string {
  if (carrying === 'document') return 'sit_read'
  if (carrying === 'phone') return 'sit_phone'
  return 'sit_type'
}

function pickStandVariant(personSeed: number | undefined): string {
  if (personSeed === undefined) return 'idle'
  return (personSeed >>> 0) % 5 === 4 ? 'think' : 'idle'
}

function pickTalkVariant(personSeed: number | undefined): string {
  return ((personSeed ?? 0) >>> 0) % 2 === 1 ? 'stand_talk_b' : 'stand_talk_a'
}

/** All known director pose keys + phase-07b §3.5 action aliases. */
export type KnownActionKey =
  | PoseKey
  | 'idle'
  | 'idle_stand'
  | 'sit_idle'
  | 'sit_type'
  | 'review'
  | 'stand_talk_a'
  | 'stand_talk_b'
  | 'wave'
  | 'think'
  | 'drink'
  | 'coffee_drink'
  | 'tea_sit'
  | 'sofa_sit'
  | 'sleep_desk'
  | 'pingpong'
  | 'arcade'
  | 'elevator_wait'
  | 'massage'
  | 'celebrate'
  | 'blocked'
  | 'frustrated'

const POSE_KEY_SET: ReadonlySet<string> = new Set(POSE_KEYS)

function mapActionToClip(poseOrAction: string, opts: ResolveActionClipOptions): string {
  switch (poseOrAction) {
    case 'stand':
    case 'idle_stand':
      return pickStandVariant(opts.personSeed)
    case 'idle':
    case 'wait_stand':
    case 'listen':
      return 'idle'
    case 'walk':
      return opts.carrying ? 'carry_walk' : 'walk'
    case 'carry_walk':
      return 'carry_walk'
    case 'wait_elevator':
    case 'ride':
    case 'elevator_wait':
      return 'elevator_wait'
    case 'sit':
    case 'sit_idle':
    case 'wait_seat':
    case 'play_boardgame':
    case 'tea_sit':
      return 'sit_idle'
    case 'sit_work':
      return resolveSitWorkClip(opts.carrying)
    case 'sit_type':
      return 'sit_type'
    case 'sit_read':
    case 'review':
      return 'sit_read'
    case 'sit_phone':
      return 'sit_phone'
    case 'talk':
      return pickTalkVariant(opts.personSeed)
    case 'stand_talk_a':
      return 'stand_talk_a'
    case 'stand_talk_b':
      return 'stand_talk_b'
    case 'think':
      return 'think'
    case 'coffee':
    case 'coffee_drink':
    case 'drink':
      return 'drink'
    case 'tea':
      return opts.seated ? 'sit_idle' : 'drink'
    case 'sofa':
    case 'sofa_sit':
    case 'massage':
      return 'sofa_sit'
    case 'nap_desk':
    case 'sleep_desk':
      return 'sleep_desk'
    case 'sleep_bed':
      return 'sleep_bed'
    case 'play_pingpong':
    case 'pingpong':
      return 'pingpong'
    case 'play_arcade':
    case 'arcade':
      return 'arcade'
    case 'karaoke':
      return 'karaoke'
    case 'greet':
    case 'wave':
      return 'wave'
    case 'done':
    case 'celebrate':
      return 'celebrate'
    case 'stuck':
    case 'blocked':
    case 'frustrated':
      return 'frustrated'
    default: {
      if (import.meta.env?.DEV && !warnedUnknownActions.has(poseOrAction) && !POSE_KEY_SET.has(poseOrAction)) {
        warnedUnknownActions.add(poseOrAction)
        console.warn(`[animLibrary] Unknown pose/action "${poseOrAction}"; falling back to "idle"`)
      }
      return 'idle'
    }
  }
}

/** Resolve a director `PoseKey` or §3.5 action string into an animation clip, speed, loop & seat offset. */
export function resolveActionClip(
  poseOrAction: string,
  opts: ResolveActionClipOptions = {},
): ActionClipResolution {
  const clip = mapActionToClip(poseOrAction, opts)
  const meta = getAnimClipMeta(clip) ?? CLIP_META.idle!
  const isWalk = clip === 'walk' || clip === 'carry_walk'
  const timeScale = isWalk ? resolveWalkTimeScale(clip, opts) : 1
  const seatOffsetY = seatYOffset(clip, opts.heightScale ?? 1)
  const oneShotPrev = ONE_SHOT_CLIPS.has(clip)

  const out: ActionClipResolution = {
    clip,
    timeScale,
    loop: meta.loop,
    seatOffsetY,
  }
  if (meta.eyes !== undefined) out.eyes = meta.eyes
  if (oneShotPrev) out.oneShotPrev = true
  return out
}

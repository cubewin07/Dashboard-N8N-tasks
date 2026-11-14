import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

export type HeldPropKind =
  | 'document'
  | 'laptop'
  | 'phone'
  | 'tablet'
  | 'box'
  | 'camera'
  | 'cup'
  | 'mic'
  | 'paddle'

export const HELD_PROP_MODELS: Readonly<Record<HeldPropKind, string>> = {
  document: 'models/props/held_document_01.glb',
  laptop: 'models/props/held_laptop_01.glb',
  phone: 'models/props/held_phone_01.glb',
  tablet: 'models/props/held_tablet_01.glb',
  box: 'models/props/held_box_01.glb',
  camera: 'models/props/held_camera_01.glb',
  cup: 'models/props/held_cup_01.glb',
  mic: 'models/props/held_mic_01.glb',
  paddle: 'models/props/held_paddle_01.glb',
}

export interface HeldPropDeps {
  loader?: { loadAsync(url: string): Promise<GLTF> }
  baseUrl?: string
}

const DESK_SURFACE_CLIPS = new Set<string>([
  'sit_type',
  'sit_read',
  'sit_phone',
  'sleep_desk',
  'sit_work',
  'nap_desk',
  'review',
])

const DESK_HIDDEN_CARRIED = new Set<string>(['laptop', 'document', 'phone'])

const SLEEP_CLIPS = new Set<string>(['sleep_desk', 'sleep_bed', 'nap_desk'])

const propPromiseCache = new Map<string, Promise<THREE.Object3D>>()
const propSceneCache = new Map<string, THREE.Object3D>()
const failedKinds = new Set<string>()

let defaultLoader: GLTFLoader | null = null

const tmpInvParent = new THREE.Matrix4()
const tmpLocalMat = new THREE.Matrix4()

function getDefaultLoader(): GLTFLoader {
  if (!defaultLoader) {
    defaultLoader = new GLTFLoader()
    defaultLoader.setMeshoptDecoder(MeshoptDecoder)
  }
  return defaultLoader
}

export function heldPropAssetUrl(kind: string, baseUrl: string = import.meta.env.BASE_URL): string | null {
  const relPath = HELD_PROP_MODELS[kind as HeldPropKind]
  if (!relPath) return null
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${cleanBase}assets/${relPath}`
}

export function isHeldPropKind(kind: string): kind is HeldPropKind {
  return Object.prototype.hasOwnProperty.call(HELD_PROP_MODELS, kind)
}

/**
 * Determine which held prop (if any) should be attached to `Attach_HandR`.
 * Hides `laptop`, `document`, and `phone` when seated at a desk-surface clip
 * (`sit_type`, `sit_read`, `sit_phone`, `sleep_desk`, `sit_work`, `nap_desk`, `review`)
 * so the carried item does not clip through the desk.
 */
export function resolveHeldProp(
  poseOrClip: string,
  carrying: string | null | undefined,
  seated: boolean,
): string | null {
  if (poseOrClip === 'play_pingpong' || poseOrClip === 'pingpong') return 'paddle'
  if (poseOrClip === 'karaoke') return 'mic'
  if (poseOrClip === 'coffee' || poseOrClip === 'coffee_drink' || poseOrClip === 'drink') return 'cup'
  if (poseOrClip === 'tea') return seated ? null : 'cup'

  if (!carrying) return null
  if (SLEEP_CLIPS.has(poseOrClip)) return null
  if (seated && DESK_SURFACE_CLIPS.has(poseOrClip) && DESK_HIDDEN_CARRIED.has(carrying)) {
    return null
  }
  return isHeldPropKind(carrying) ? carrying : null
}

/** Load and cache a held-prop GLB scene by kind. */
export async function loadHeldProp(kind: string, deps?: HeldPropDeps): Promise<THREE.Object3D | null> {
  const url = heldPropAssetUrl(kind, deps?.baseUrl)
  if (!url) return null

  const cached = propSceneCache.get(kind)
  if (cached) return cached

  const existing = propPromiseCache.get(kind)
  if (existing) return existing

  const loader = deps?.loader ?? getDefaultLoader()
  const promise = loader
    .loadAsync(url)
    .then((gltf) => {
      const root = gltf.scene
      root.name = `held_${kind}`
      propSceneCache.set(kind, root)
      failedKinds.delete(kind)
      return root
    })
    .catch((err: unknown) => {
      propPromiseCache.delete(kind)
      if (!failedKinds.has(kind)) {
        failedKinds.add(kind)
        console.warn(`[props] Failed to load held prop "${kind}" from "${url}"`, err)
      }
      throw err
    })

  propPromiseCache.set(kind, promise)
  return promise
}

export async function preloadHeldProps(deps?: HeldPropDeps): Promise<void> {
  const kinds = Object.keys(HELD_PROP_MODELS) as HeldPropKind[]
  await Promise.allSettled(kinds.map((kind) => loadHeldProp(kind, deps)))
}

export function getCachedHeldProp(kind: string): THREE.Object3D | null {
  return propSceneCache.get(kind) ?? null
}

export function registerHeldPropModel(kind: string, model: THREE.Object3D): void {
  propSceneCache.set(kind, model)
  failedKinds.delete(kind)
}

export function clearHeldPropCache(): void {
  propPromiseCache.clear()
  propSceneCache.clear()
  failedKinds.clear()
}

function getManagedChildren(propRoot: THREE.Object3D): Map<string, THREE.Object3D> {
  let map = propRoot.userData.__heldPropChildren as Map<string, THREE.Object3D> | undefined
  if (!map) {
    map = new Map<string, THREE.Object3D>()
    propRoot.userData.__heldPropChildren = map
  }
  return map
}

function hasUnmanagedChild(propRoot: THREE.Object3D): boolean {
  for (const child of propRoot.children) {
    if (!child.userData.__heldPropKind) return true
  }
  return false
}

/**
 * Sync `propRoot` to follow `boneHandR`'s world transform and show the mesh for `kind`.
 * Returns `true` when `propRoot` is visible.
 */
export function syncHeldProp(
  propRoot: THREE.Object3D,
  kind: string | null,
  boneHandR: THREE.Object3D | null,
  deps?: HeldPropDeps,
): boolean {
  if (!kind || !boneHandR) {
    propRoot.visible = false
    propRoot.userData.heldKind = null
    return false
  }

  boneHandR.updateWorldMatrix(true, false)
  if (propRoot.parent) {
    propRoot.parent.updateWorldMatrix(true, false)
    tmpInvParent.copy(propRoot.parent.matrixWorld).invert()
    tmpLocalMat.multiplyMatrices(tmpInvParent, boneHandR.matrixWorld)
    tmpLocalMat.decompose(propRoot.position, propRoot.quaternion, propRoot.scale)
  } else {
    boneHandR.matrixWorld.decompose(propRoot.position, propRoot.quaternion, propRoot.scale)
  }
  propRoot.updateMatrixWorld(true)

  const managed = getManagedChildren(propRoot)
  for (const [k, child] of managed) {
    child.visible = k === kind
  }

  let activeChild = managed.get(kind)
  if (!activeChild) {
    const cached = propSceneCache.get(kind)
    if (cached) {
      activeChild = cached.clone(true)
      activeChild.userData.__heldPropKind = kind
      activeChild.visible = true
      managed.set(kind, activeChild)
      propRoot.add(activeChild)
    } else if (!failedKinds.has(kind)) {
      void loadHeldProp(kind, deps).catch(() => {})
    }
  }

  propRoot.userData.heldKind = kind
  propRoot.visible = Boolean(activeChild) || hasUnmanagedChild(propRoot)
  return propRoot.visible
}

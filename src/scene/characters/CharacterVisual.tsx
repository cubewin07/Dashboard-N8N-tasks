import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { AppearanceV1 } from '@/domain/appearance'
import type { EmployeeId } from '@/domain/primitives'
import { hashString } from '@/scene/director/rng'
import { getLoadProgress, subscribeModels } from '@/scene/render/assets/modelStore'
import { CapsulePeople } from '@/scene/render/CapsulePeople'
import { SCENE_PALETTE } from '@/scene/render/palette'
import type { PersonVisualInput, PersonVisualSystem } from '@/scene/render/PersonVisual'
import { hashAppearance, migrateAppearance } from './appearance'
import {
  loadAnimLibrary,
  resolveActionClip,
  type ActionClipResolution,
  type AnimLibraryDeps,
} from './animLibrary'
import {
  assembleCharacter,
  type AssembleCharacterInput,
  type AssembledCharacter,
  type BodyInputObject,
  type WardrobePartInput,
} from './assemble'
import { effectiveLimits, mapBodySliders, type WardrobeLimitMeta } from './bodyMap'
import { DEFAULT_CATALOG, getCatalogItem, type Catalog, type CatalogItem } from './catalog'
import { applyFaceCells, createBlinkState, stepBlink, type BlinkState, type EyeState } from './faceAnim'
import { generateAppearance } from './generate'
import { CharacterLodScheduler } from './lod'
import {
  loadBodyMeta,
  loadBodyPart,
  loadWardrobeMeta,
  loadWardrobePart,
  preloadCatalogParts,
  type BodyMeta,
  type CharacterBase,
  type PartLoaderDeps,
  type WardrobeMeta,
} from './partLoader'
import { preloadHeldProps, resolveHeldProp, syncHeldProp, type HeldPropDeps } from './props'

export type CharacterRenderMode = 'capsule' | 'full'

/** Resolve `VITE_CHARACTERS` feature flag (`'capsule'` or default `'full'`). */
export function resolveCharacterMode(
  modeFlag: string | undefined = import.meta.env.VITE_CHARACTERS as string | undefined,
): CharacterRenderMode {
  return modeFlag?.trim().toLowerCase() === 'capsule' ? 'capsule' : 'full'
}

export interface CharacterDebugSnapshot {
  assembled: number
  total: number
  queued: number
  failed: number
  cacheSize: number
  mixersPerSec: number
  avgAssemblyMs: number
}

export interface CharacterPeopleDeps {
  catalog?: Catalog
  partLoaderDeps?: PartLoaderDeps
  animLoaderDeps?: AnimLibraryDeps
  propDeps?: HeldPropDeps
  assembleFn?: (input: AssembleCharacterInput) => AssembledCharacter
  loadAnimFn?: () => Promise<Map<string, THREE.AnimationClip>>
  loadBodyPartFn?: (base: CharacterBase) => Promise<THREE.Object3D | BodyInputObject>
  loadBodyMetaFn?: () => Promise<BodyMeta>
  loadWardrobePartFn?: (pathOrId: string, base: CharacterBase) => Promise<THREE.Object3D | THREE.BufferGeometry>
  loadWardrobeMetaFn?: (idOrPath: string) => Promise<WardrobeMeta>
  preloadFn?: () => Promise<unknown>
  onAssemblyUpdate?: () => void
  deferUntilAssetsSettled?: boolean
  maxAssembliesPerFrame?: number
  capacity?: number
  logger?: Pick<Console, 'error' | 'warn'>
}

interface CharacterSlot {
  id: EmployeeId
  seed: number
  desiredAppearance: AppearanceV1
  desiredHash: string
  hasCustomAppearance: boolean
  hasResolvedName: boolean
  assembled: AssembledCharacter | null
  assembledHash: string | null
  heightScale: number
  assembling: boolean
  assemblingHash: string | null
  failed: boolean
  wrapper: THREE.Group
  propRoot: THREE.Group
  mixer: THREE.AnimationMixer | null
  actions: Map<string, THREE.AnimationAction>
  currentClip: string | null
  currentAction: THREE.AnimationAction | null
  oneShotClip: string | null
  blink: BlinkState
  lastEyeState: EyeState | null
  fade: number
  sat: number
  ring: number
  lastSeenFrame: number
  lastX: number
  lastY: number
  lastZ: number
  lastTop: number
  lastFade: number
  disposed: boolean
}

interface MixerRateSample {
  dt: number
  updates: number
}

const DEFAULT_CAPACITY = 256
const DEFAULT_MAX_ASSEMBLIES_PER_FRAME = 2
const CROSSFADE_SECONDS = 0.2
const PICK_RADIUS = 0.3
const CAPSULE_FALLBACK_TOP = 1.51
const RIG_DEFAULT_TOP = 1.72

const FLAT_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
const TMP_MATRIX = new THREE.Matrix4()
const TMP_POS = new THREE.Vector3()
const TMP_SCALE = new THREE.Vector3()
const TMP_SPHERE = new THREE.Sphere()
const TMP_PROJ_SCREEN = new THREE.Matrix4()
const TMP_FRUSTUM = new THREE.Frustum()
const TMP_SEG_A = new THREE.Vector3()
const TMP_SEG_B = new THREE.Vector3()
const TMP_SEG_CLOSEST = new THREE.Vector3()
const TMP_HEAD_WORLD = new THREE.Vector3()

function checkFailPattern(pattern: string | null, target: string): void {
  if (pattern && target.includes(pattern)) {
    throw new Error(`Simulated asset load failure matching "${pattern}" on "${target}"`)
  }
}

function collectDesiredWardrobeItems(
  appearance: AppearanceV1,
  catalog: Catalog,
): CatalogItem[] {
  const candidates: Array<{ slot: string; id: string }> = []
  if (appearance.hair.item) candidates.push({ slot: 'hair', id: appearance.hair.item })
  if (appearance.face.facialHair) {
    candidates.push({ slot: 'facial_hair', id: appearance.face.facialHair })
  }
  if (appearance.outfit.fullbody) {
    candidates.push({ slot: 'fullbody', id: appearance.outfit.fullbody })
  }
  if (appearance.outfit.outer) candidates.push({ slot: 'outer', id: appearance.outfit.outer })
  if (appearance.outfit.top) candidates.push({ slot: 'top', id: appearance.outfit.top })
  if (appearance.outfit.bottom) candidates.push({ slot: 'bottom', id: appearance.outfit.bottom })
  if (appearance.outfit.shoes) candidates.push({ slot: 'shoes', id: appearance.outfit.shoes })
  for (const [slot, id] of Object.entries(appearance.accessories)) {
    if (id) candidates.push({ slot, id })
  }

  const resolved: CatalogItem[] = []
  const hiddenSlots = new Set<string>()

  for (const entry of candidates) {
    const item = getCatalogItem(catalog, entry.id)
    if (!item) continue
    resolved.push(item)
    for (const h of item.hides) {
      hiddenSlots.add(h)
    }
  }

  return resolved.filter((item) => !hiddenSlots.has(item.slot))
}

/**
 * Full 3D articulated character renderer implementing `PersonVisualSystem`
 * with capsule fallback per person, ≤2 assemblies/frame queueing,
 * staggered 30/15/5/0 Hz mixer LOD, frustum culling, and geometry disposal.
 */
export class CharacterPeople implements PersonVisualSystem {
  readonly object = new THREE.Group()

  private readonly catalog: Catalog
  private readonly deps: CharacterPeopleDeps
  private readonly assembleFn: (input: AssembleCharacterInput) => AssembledCharacter
  private readonly maxAssembliesPerFrame: number
  private readonly logger: Pick<Console, 'error' | 'warn'>

  private readonly fallbackCapsules: CapsulePeople
  private readonly fallbackInputs: PersonVisualInput[] = []
  private readonly fallbackIndexById = new Map<EmployeeId, number>()

  private readonly ringMesh: THREE.InstancedMesh
  private readonly capacity: number

  private readonly slots = new Map<EmployeeId, CharacterSlot>()
  private readonly assemblyQueue: EmployeeId[] = []
  private readonly queuedSet = new Set<EmployeeId>()
  private readonly loggedErrorIds = new Set<EmployeeId>()
  private readonly employeeNames = new Map<EmployeeId, string>()

  private readonly lodScheduler = new CharacterLodScheduler()
  private readonly mixerRateSamples: MixerRateSample[] = []
  private mixerWindowDt = 0
  private mixerWindowUpdates = 0

  private readonly lastIds: EmployeeId[] = []
  private readonly lastPx: Float32Array
  private readonly lastPy: Float32Array
  private readonly lastPz: Float32Array
  private readonly lastTop: Float32Array
  private readonly lastFade: Float32Array
  private lastCount = 0

  private animClips: Map<string, THREE.AnimationClip> | null = null
  private animLoadPromise: Promise<Map<string, THREE.AnimationClip>> | null = null
  private unsubscribeModels: (() => void) | null = null
  private assetsGateOpen = false
  private preloaded = false
  private disposed = false

  private camera: THREE.Camera | null = null
  private focusedFloorIndex: number | null = null
  private failUrlPattern: string | null = null
  private motion = 1
  private time = 0
  private frame = 0
  private totalDisposedCount = 0
  private totalAssemblyMs = 0
  private totalAssemblyCount = 0
  private inFlightCount = 0

  constructor(deps: CharacterPeopleDeps = {}) {
    this.object.name = 'character-people'
    this.deps = deps
    this.catalog = deps.catalog ?? DEFAULT_CATALOG
    this.assembleFn = deps.assembleFn ?? assembleCharacter
    this.maxAssembliesPerFrame = Math.max(
      1,
      deps.maxAssembliesPerFrame ?? DEFAULT_MAX_ASSEMBLIES_PER_FRAME,
    )
    this.logger = deps.logger ?? console
    this.capacity = deps.capacity ?? DEFAULT_CAPACITY
    this.assetsGateOpen = !deps.deferUntilAssetsSettled || getLoadProgress().settled

    this.fallbackCapsules = new CapsulePeople(this.capacity)
    this.object.add(this.fallbackCapsules.object)

    const ringGeometry = new THREE.RingGeometry(0.34, 0.44, 28)
    const ringMaterial = new THREE.MeshBasicMaterial({ toneMapped: false })
    this.ringMesh = new THREE.InstancedMesh(ringGeometry, ringMaterial, this.capacity)
    this.ringMesh.name = 'character-rings'
    this.ringMesh.count = 0
    this.ringMesh.frustumCulled = false
    this.ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.ringMesh.setColorAt(0, new THREE.Color(1, 1, 1))
    this.ringMesh.instanceColor!.setUsage(THREE.DynamicDrawUsage)
    this.ringMesh.raycast = () => {}
    this.object.add(this.ringMesh)

    this.lastPx = new Float32Array(this.capacity)
    this.lastPy = new Float32Array(this.capacity)
    this.lastPz = new Float32Array(this.capacity)
    this.lastTop = new Float32Array(this.capacity)
    this.lastFade = new Float32Array(this.capacity)
  }

  setCamera(camera: THREE.Camera | null): void {
    this.camera = camera
  }

  setFocusedFloorIndex(floorIndex: number | null): void {
    this.focusedFloorIndex = floorIndex
  }

  setEmployeeNames(names: ReadonlyMap<EmployeeId, string>): void {
    for (const [id, name] of names) {
      const prev = this.employeeNames.get(id)
      if (prev === name) continue
      this.employeeNames.set(id, name)
      const slot = this.slots.get(id)
      if (slot && !slot.hasCustomAppearance && !slot.hasResolvedName) {
        const regenerated = generateAppearance(id, this.catalog, { name })
        slot.desiredAppearance = regenerated
        slot.desiredHash = hashAppearance(regenerated)
        slot.hasResolvedName = true
        if (slot.assembledHash !== slot.desiredHash && !slot.failed) {
          this.enqueue(id)
        }
      }
    }
  }

  setAppearance(employeeId: EmployeeId, doc: unknown): AppearanceV1 {
    const migrated = migrateAppearance(doc, this.catalog)
    const nextHash = hashAppearance(migrated)
    let slot = this.slots.get(employeeId)
    if (!slot) {
      slot = this.createSlot(employeeId, migrated, nextHash, true)
      this.slots.set(employeeId, slot)
    } else {
      slot.desiredAppearance = migrated
      slot.desiredHash = nextHash
      slot.hasCustomAppearance = true
      slot.failed = false
      this.loggedErrorIds.delete(employeeId)
    }

    if (slot.assembledHash !== nextHash) {
      this.enqueue(employeeId)
    }
    this.deps.onAssemblyUpdate?.()
    return migrated
  }

  setFailUrlForTest(pattern: string | null): void {
    this.failUrlPattern = pattern
  }

  get canProcessQueue(): boolean {
    return this.assetsGateOpen
  }

  get disposeCount(): number {
    return this.totalDisposedCount
  }

  getDebugSnapshot(): CharacterDebugSnapshot {
    let assembled = 0
    let failed = 0
    for (const slot of this.slots.values()) {
      if (slot.failed) failed += 1
      if (slot.assembled && !slot.failed) assembled += 1
    }
    const mixersPerSec =
      this.mixerWindowDt > 0
        ? Math.round((this.mixerWindowUpdates / this.mixerWindowDt) * 10) / 10
        : 0

    const avgAssemblyMs =
      this.totalAssemblyCount > 0
        ? Math.round((this.totalAssemblyMs / this.totalAssemblyCount) * 100) / 100
        : 0

    return {
      assembled,
      total: this.lastCount > 0 ? this.lastCount : this.slots.size,
      queued: this.assemblyQueue.length + this.inFlightCount,
      failed,
      cacheSize: assembled,
      mixersPerSec,
      avgAssemblyMs,
    }
  }

  setReducedMotion(reduced: boolean): void {
    this.motion = reduced ? 0 : 1
    this.fallbackCapsules.setReducedMotion(reduced)
  }

  sync(inputs: readonly PersonVisualInput[], count: number, dt: number): void {
    if (this.disposed) return

    this.ensurePreloaded()

    const n = Math.min(count, this.capacity)
    this.frame += 1
    this.time += dt
    this.lodScheduler.beginFrame()

    const fadeStep = dt > 0 ? 1 - Math.exp(-9 * dt) : 1

    let hasFrustum = false
    if (this.camera) {
      this.camera.updateMatrixWorld()
      TMP_PROJ_SCREEN.multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      )
      TMP_FRUSTUM.setFromProjectionMatrix(TMP_PROJ_SCREEN)
      hasFrustum = true
    }

    let fallbackCount = 0
    let ringCount = 0
    this.fallbackIndexById.clear()

    for (let i = 0; i < n; i += 1) {
      const p = inputs[i]!
      let slot = this.slots.get(p.id)
      if (!slot) {
        const name = this.employeeNames.get(p.id)
        const appearance = generateAppearance(p.id, this.catalog, { name })
        slot = this.createSlot(p.id, appearance, hashAppearance(appearance), false)
        slot.hasResolvedName = name !== undefined
        slot.fade = p.opacity
        slot.sat = p.saturation
        this.slots.set(p.id, slot)
      }
      slot.lastSeenFrame = this.frame

      if (slot.assembledHash !== slot.desiredHash && !slot.failed) {
        this.enqueue(p.id)
      }

      slot.fade += (p.opacity - slot.fade) * fadeStep
      const fade = slot.fade < 0.02 ? 0 : slot.fade > 0.98 ? 1 : slot.fade
      slot.sat += (p.saturation - slot.sat) * fadeStep

      this.lastIds[i] = p.id
      this.lastPx[i] = p.x
      this.lastPy[i] = p.y
      this.lastPz[i] = p.z
      this.lastFade[i] = fade

      const assembled = slot.assembled
      if (!assembled || slot.failed) {
        slot.wrapper.visible = false
        this.fallbackInputs[fallbackCount] = p
        this.fallbackIndexById.set(p.id, fallbackCount)
        fallbackCount += 1
        this.lastTop[i] = CAPSULE_FALLBACK_TOP
        continue
      }

      const scale = slot.heightScale
      const resolution = resolveActionClip(p.pose, {
        carrying: p.carrying,
        speed01: p.speed01,
        personSeed: slot.seed,
        heightScale: scale,
        seated: p.seated,
      })

      slot.wrapper.position.set(p.x, p.y + resolution.seatOffsetY, p.z)
      slot.wrapper.rotation.set(0, p.yaw, 0)
      slot.wrapper.scale.setScalar(scale)

      if (fade === 0) {
        slot.wrapper.visible = false
        this.lodScheduler.step(
          p.id,
          { distance: Infinity, opacity: 0, inFrustum: false, visible: false },
          dt,
        )
        this.lastTop[i] = RIG_DEFAULT_TOP * scale
        continue
      }

      let distance = 10
      let inFrustum = true
      if (hasFrustum && this.camera) {
        TMP_POS.set(p.x, p.y + 0.9 * scale, p.z)
        distance = this.camera.position.distanceTo(TMP_POS)
        TMP_SPHERE.set(TMP_POS, 1.2 * scale)
        inFrustum = TMP_FRUSTUM.intersectsSphere(TMP_SPHERE)
      }

      const onFocusedFloor =
        this.focusedFloorIndex === null || p.floorIndex === this.focusedFloorIndex

      const lodStep = this.lodScheduler.step(
        p.id,
        {
          distance,
          opacity: fade,
          inFrustum,
          visible: true,
          onFocusedFloor,
          followed: p.followed,
          selected: p.selected,
        },
        dt,
      )

      slot.wrapper.visible = lodStep.visible
      if (lodStep.visible) {
        setFadeSat(assembled, fade, slot.sat)
        this.applyAnimation(slot, assembled, p, resolution, lodStep.shouldUpdate ? lodStep.stepDt : 0)
      }

      const ringTarget = p.followed ? 1.15 : p.selected ? 1 : p.hovered ? 0.85 : 0
      slot.ring += (ringTarget - slot.ring) * (dt > 0 ? 1 - Math.exp(-16 * dt) : 1)
      if (lodStep.visible && slot.ring > 0.02) {
        const pulse = p.followed ? 1 + Math.sin(this.time * 4) * 0.06 * this.motion : 1
        TMP_POS.set(p.x, p.y + 0.035, p.z)
        TMP_SCALE.setScalar(slot.ring * pulse)
        TMP_MATRIX.compose(TMP_POS, FLAT_QUAT, TMP_SCALE)
        this.ringMesh.setMatrixAt(ringCount, TMP_MATRIX)
        this.ringMesh.setColorAt(
          ringCount,
          p.followed
            ? SCENE_PALETTE.people.ringFollowed
            : p.selected
              ? SCENE_PALETTE.people.ringSelected
              : SCENE_PALETTE.people.ringHover,
        )
        ringCount += 1
      }

      this.lastTop[i] = computeRigTop(slot, assembled, resolution.clip, scale)
      slot.lastX = p.x
      slot.lastY = p.y
      slot.lastZ = p.z
      slot.lastTop = this.lastTop[i]!
      slot.lastFade = fade
    }

    this.lastCount = n
    this.lastIds.length = n

    this.fallbackCapsules.sync(this.fallbackInputs, fallbackCount, dt)

    this.ringMesh.count = ringCount
    if (ringCount > 0) {
      this.ringMesh.instanceMatrix.needsUpdate = true
      if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true
    }

    this.recordMixerRate(dt, this.lodScheduler.updatesThisFrame)
    this.processQueue()

    if (this.frame % 120 === 0) {
      this.pruneStaleSlots()
    }
  }

  pick(ray: THREE.Ray): EmployeeId | null {
    let best: EmployeeId | null = null
    let bestAlong = Infinity

    for (let i = 0; i < this.lastCount; i += 1) {
      if (this.lastFade[i]! < 0.5) continue
      const id = this.lastIds[i]!
      const fallbackIdx = this.fallbackIndexById.get(id)
      const top = this.lastTop[i]!
      TMP_SEG_A.set(this.lastPx[i]!, this.lastPy[i]! + 0.15, this.lastPz[i]!)
      TMP_SEG_B.set(this.lastPx[i]!, this.lastPy[i]! + Math.max(0.4, top - 0.1), this.lastPz[i]!)
      const d2 = ray.distanceSqToSegment(TMP_SEG_A, TMP_SEG_B, TMP_SEG_CLOSEST)
      if (d2 > PICK_RADIUS * PICK_RADIUS) continue
      if (fallbackIdx === undefined || this.fallbackCapsules) {
        const along = TMP_SEG_CLOSEST.distanceToSquared(ray.origin)
        if (along < bestAlong) {
          bestAlong = along
          best = id
        }
      }
    }

    return best
  }

  headOf(id: EmployeeId, out: THREE.Vector3): boolean {
    return this.headAt(this.lastIds.indexOf(id), out)
  }

  headAt(index: number, out: THREE.Vector3): boolean {
    if (index < 0 || index >= this.lastCount || this.lastFade[index]! < 0.5) {
      return false
    }
    const id = this.lastIds[index]!
    const fallbackIdx = this.fallbackIndexById.get(id)
    if (fallbackIdx !== undefined && this.fallbackCapsules.headAt(fallbackIdx, out)) {
      return true
    }
    out.set(this.lastPx[index]!, this.lastPy[index]! + this.lastTop[index]!, this.lastPz[index]!)
    return true
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.unsubscribeModels) {
      this.unsubscribeModels()
      this.unsubscribeModels = null
    }

    for (const slot of this.slots.values()) {
      this.disposeSlot(slot)
    }
    this.slots.clear()
    this.assemblyQueue.length = 0
    this.queuedSet.clear()
    this.loggedErrorIds.clear()
    this.lodScheduler.reset()

    this.fallbackCapsules.dispose()
    this.ringMesh.geometry.dispose()
    ;(this.ringMesh.material as THREE.Material).dispose()
    this.ringMesh.dispose()
    this.object.clear()
  }

  private createSlot(
    id: EmployeeId,
    appearance: AppearanceV1,
    hash: string,
    hasCustomAppearance: boolean,
  ): CharacterSlot {
    const wrapper = new THREE.Group()
    wrapper.name = `character-slot-${id}`
    wrapper.visible = false
    const propRoot = new THREE.Group()
    propRoot.name = `character-prop-${id}`
    propRoot.visible = false
    wrapper.add(propRoot)
    this.object.add(wrapper)

    return {
      id,
      seed: hashString(id),
      desiredAppearance: appearance,
      desiredHash: hash,
      hasCustomAppearance,
      hasResolvedName: false,
      assembled: null,
      assembledHash: null,
      heightScale: 1,
      assembling: false,
      assemblingHash: null,
      failed: false,
      wrapper,
      propRoot,
      mixer: null,
      actions: new Map<string, THREE.AnimationAction>(),
      currentClip: null,
      currentAction: null,
      oneShotClip: null,
      blink: createBlinkState(id),
      lastEyeState: null,
      fade: 1,
      sat: 1,
      ring: 0,
      lastSeenFrame: this.frame,
      lastX: 0,
      lastY: 0,
      lastZ: 0,
      lastTop: RIG_DEFAULT_TOP,
      lastFade: 1,
      disposed: false,
    }
  }

  private disposeSlot(slot: CharacterSlot): void {
    slot.disposed = true
    this.releaseAssembled(slot)
    slot.wrapper.clear()
    this.object.remove(slot.wrapper)
  }

  private releaseAssembled(slot: CharacterSlot): void {
    if (!slot.assembled) return
    if (slot.mixer) {
      slot.mixer.stopAllAction()
      slot.mixer.uncacheRoot(slot.assembled.mesh)
    }
    slot.wrapper.remove(slot.assembled.mesh)
    slot.assembled.dispose()
    slot.assembled = null
    slot.assembledHash = null
    slot.mixer = null
    slot.actions.clear()
    slot.currentAction = null
    slot.currentClip = null
    slot.oneShotClip = null
    slot.lastEyeState = null
    this.totalDisposedCount += 1
  }

  private enqueue(id: EmployeeId): void {
    if (this.queuedSet.has(id)) return
    const slot = this.slots.get(id)
    if (!slot || slot.assembling) return
    this.queuedSet.add(id)
    this.assemblyQueue.push(id)
  }

  private processQueue(): void {
    if (!this.assetsGateOpen) return
    let started = 0
    while (started < this.maxAssembliesPerFrame && this.assemblyQueue.length > 0) {
      const id = this.assemblyQueue.shift()!
      this.queuedSet.delete(id)
      const slot = this.slots.get(id)
      if (!slot || slot.disposed || slot.failed) continue
      if (slot.assembledHash === slot.desiredHash || slot.assembling) continue

      started += 1
      void this.assembleSlot(slot)
    }
  }

  private ensurePreloaded(): void {
    if (this.preloaded) return
    if (!this.assetsGateOpen) {
      if (getLoadProgress().settled) {
        this.assetsGateOpen = true
      } else if (!this.unsubscribeModels) {
        this.unsubscribeModels = subscribeModels(() => {
          if (this.disposed || !getLoadProgress().settled) return
          if (this.unsubscribeModels) {
            this.unsubscribeModels()
            this.unsubscribeModels = null
          }
          this.assetsGateOpen = true
          this.ensurePreloaded()
          this.deps.onAssemblyUpdate?.()
        })
        return
      } else {
        return
      }
    }
    this.preloaded = true
    void this.ensureAnimClips().catch(() => {})
    if (this.deps.preloadFn) {
      void this.deps.preloadFn().catch(() => {})
      return
    }
    if (
      !this.deps.loadBodyPartFn &&
      !this.deps.loadBodyMetaFn &&
      !this.deps.loadWardrobePartFn &&
      !this.deps.loadWardrobeMetaFn
    ) {
      void this.loadBodyMetaSafe().catch(() => {})
      void this.loadBodyAssetSafe('female').catch(() => {})
      void this.loadBodyAssetSafe('male').catch(() => {})
      void preloadCatalogParts(this.deps.partLoaderDeps).catch(() => {})
      void preloadHeldProps(this.deps.propDeps).catch(() => {})
    }
  }

  private ensureAnimClips(): Promise<Map<string, THREE.AnimationClip>> {
    if (this.animClips) return Promise.resolve(this.animClips)
    if (this.animLoadPromise) return this.animLoadPromise

    const loaderPromise = this.deps.loadAnimFn
      ? this.deps.loadAnimFn()
      : loadAnimLibrary(this.deps.animLoaderDeps).then((data) => data.clips)

    this.animLoadPromise = loaderPromise
      .then((clips) => {
        this.animClips = clips
        return clips
      })
      .catch((err: unknown) => {
        this.animLoadPromise = null
        throw err
      })

    return this.animLoadPromise
  }

  private async loadBodyMetaSafe(): Promise<BodyMeta> {
    checkFailPattern(this.failUrlPattern, 'models/characters/body.meta.json')
    if (this.deps.loadBodyMetaFn) return this.deps.loadBodyMetaFn()
    return loadBodyMeta(this.deps.partLoaderDeps)
  }

  private async loadBodyAssetSafe(base: CharacterBase): Promise<THREE.Object3D | BodyInputObject> {
    checkFailPattern(this.failUrlPattern, `models/characters/body_${base}.glb`)
    if (this.deps.loadBodyPartFn) return this.deps.loadBodyPartFn(base)
    const gltf = await loadBodyPart(base, this.deps.partLoaderDeps)
    return gltf.scene
  }

  private async loadWardrobeMetaSafe(item: CatalogItem): Promise<WardrobeMeta> {
    checkFailPattern(this.failUrlPattern, `models/wardrobe/${item.id}.meta.json`)
    if (this.deps.loadWardrobeMetaFn) return this.deps.loadWardrobeMetaFn(item.id)
    return loadWardrobeMeta(item.id, this.deps.partLoaderDeps)
  }

  private async loadWardrobeAssetSafe(
    base: CharacterBase,
    modelPath: string,
  ): Promise<THREE.Object3D | THREE.BufferGeometry> {
    checkFailPattern(this.failUrlPattern, modelPath)
    if (this.deps.loadWardrobePartFn) {
      return this.deps.loadWardrobePartFn(modelPath, base)
    }
    const gltf = await loadWardrobePart(modelPath, base, this.deps.partLoaderDeps)
    return gltf.scene
  }

  private async assembleSlot(slot: CharacterSlot): Promise<void> {
    const appearance = slot.desiredAppearance
    const targetHash = slot.desiredHash
    const base: CharacterBase = appearance.base

    slot.assembling = true
    slot.assemblingHash = targetHash
    this.inFlightCount += 1

    try {
      const items = collectDesiredWardrobeItems(appearance, this.catalog)

      const [, bodyMeta, bodyAsset, partResults] = await Promise.all([
        this.ensureAnimClips().catch(() => new Map<string, THREE.AnimationClip>()),
        this.loadBodyMetaSafe(),
        this.loadBodyAssetSafe(base),
        Promise.all(
          items.map(async (item): Promise<WardrobePartInput | null> => {
            const meta = await this.loadWardrobeMetaSafe(item)
            const modelPath =
              item.model?.[base] ??
              meta.bases[base]?.file ??
              `models/wardrobe/${item.id}.glb`
            const asset = await this.loadWardrobeAssetSafe(base, modelPath)
            return {
              id: item.id,
              slot: item.slot,
              asset,
              meta,
              defaultColors: item.tint?.defaults,
              hides: item.hides,
            }
          }),
        ),
      ])

      if (this.disposed || slot.disposed) return

      const parts = partResults.filter((entry): entry is WardrobePartInput => entry !== null)
      const metasById = new Map<string, WardrobeLimitMeta>()
      for (const p of parts) {
        if (p.meta) {
          metasById.set(p.id, p.meta as WardrobeLimitMeta)
        }
      }
      const limits = effectiveLimits(appearance, this.catalog, metasById)
      const mappedBody = mapBodySliders(appearance.body, limits)

      const tAssembleStart = performance.now()
      const assembled = this.assembleFn({
        appearance,
        body: bodyAsset,
        parts,
        morphWeights: mappedBody.weights,
        heightScale: mappedBody.scale,
        bodyRegions: bodyMeta.regions,
        faceAtlas: this.catalog.faceAtlas,
      })
      this.totalAssemblyMs += performance.now() - tAssembleStart
      this.totalAssemblyCount += 1

      if (this.disposed || slot.disposed) {
        assembled.dispose()
        return
      }

      assembled.mesh.castShadow = true
      assembled.mesh.receiveShadow = false
      for (const extra of assembled.extraMeshes) {
        extra.castShadow = true
        extra.receiveShadow = false
      }

      this.releaseAssembled(slot)

      slot.assembled = assembled
      slot.assembledHash = targetHash
      slot.heightScale = assembled.heightScale
      slot.failed = false
      slot.mixer = new THREE.AnimationMixer(assembled.mesh)
      slot.wrapper.add(assembled.mesh)

      if (slot.desiredHash !== targetHash) {
        this.enqueue(slot.id)
      }
    } catch (err: unknown) {
      if (this.disposed || slot.disposed) return
      slot.failed = true
      this.releaseAssembled(slot)
      if (!this.loggedErrorIds.has(slot.id)) {
        this.loggedErrorIds.add(slot.id)
        this.logger.error(`[CharacterPeople] Failed to assemble "${slot.id}":`, err)
      }
    } finally {
      slot.assembling = false
      slot.assemblingHash = null
      this.inFlightCount = Math.max(0, this.inFlightCount - 1)
      this.deps.onAssemblyUpdate?.()
    }
  }

  private applyAnimation(
    slot: CharacterSlot,
    assembled: AssembledCharacter,
    input: PersonVisualInput,
    resolution: ActionClipResolution,
    stepDt: number,
  ): void {
    const mixer = slot.mixer
    const clips = this.animClips

    if (mixer && clips) {
      const desiredClipName = resolution.clip
      let clip = clips.get(desiredClipName) ?? clips.get('idle')
      if (!clip) {
        const first = clips.values().next()
        clip = first.done ? undefined : first.value
      }

      if (clip) {
        let targetName = clip.name || desiredClipName
        if (!resolution.loop && slot.oneShotClip === targetName && slot.currentAction) {
          if (!slot.currentAction.isRunning() && resolution.oneShotPrev) {
            const fallbackName = input.seated ? 'sit_idle' : 'idle'
            const fallbackClip = clips.get(fallbackName)
            if (fallbackClip) {
              clip = fallbackClip
              targetName = fallbackName
            }
          }
        } else if (resolution.loop) {
          slot.oneShotClip = null
        }

        let action = slot.actions.get(targetName)
        if (!action) {
          action = mixer.clipAction(clip)
          slot.actions.set(targetName, action)
        }

        const effectiveTimeScale = this.motion === 0 ? 0 : resolution.timeScale
        if (slot.currentClip !== targetName) {
          if (resolution.loop) {
            action.setLoop(THREE.LoopRepeat, Infinity)
            action.clampWhenFinished = false
          } else {
            action.setLoop(THREE.LoopOnce, 1)
            action.clampWhenFinished = true
            slot.oneShotClip = targetName
          }
          action.reset()
          action.enabled = true
          action.setEffectiveTimeScale(effectiveTimeScale)
          action.setEffectiveWeight(1)
          action.play()
          if (slot.currentAction && slot.currentAction !== action) {
            action.crossFadeFrom(slot.currentAction, CROSSFADE_SECONDS, false)
          }
          slot.currentClip = targetName
          slot.currentAction = action
        } else {
          action.setEffectiveTimeScale(effectiveTimeScale)
        }

        if (stepDt > 0) {
          mixer.update(stepDt)
          assembled.mesh.updateMatrixWorld(true)
        }
      }
    }

    if (stepDt > 0 || slot.lastEyeState === null) {
      const eyeState = stepBlink(slot.blink, stepDt, {
        eyesOverride: resolution.eyes,
      })
      if (eyeState !== slot.lastEyeState && assembled.faceRegions) {
        const uv = assembled.mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined
        if (uv) {
          applyFaceCells(uv, assembled.faceRegions, {
            eyes: slot.desiredAppearance.face.eyes,
            brows: slot.desiredAppearance.face.brows,
            mouth: slot.desiredAppearance.face.mouth,
            eyeState,
          })
        }
        slot.lastEyeState = eyeState
      }
    }

    const heldKind = resolveHeldProp(resolution.clip, input.carrying, input.seated)
    syncHeldProp(slot.propRoot, heldKind, assembled.attach.handR, this.deps.propDeps)
  }

  private recordMixerRate(dt: number, updates: number): void {
    if (dt <= 0) {
      this.mixerRateSamples.length = 0
      this.mixerWindowDt = 0
      this.mixerWindowUpdates = 0
      return
    }
    this.mixerRateSamples.push({ dt, updates })
    this.mixerWindowDt += dt
    this.mixerWindowUpdates += updates
    while (this.mixerWindowDt > 1.0 && this.mixerRateSamples.length > 1) {
      const oldest = this.mixerRateSamples.shift()!
      this.mixerWindowDt -= oldest.dt
      this.mixerWindowUpdates -= oldest.updates
    }
  }

  private pruneStaleSlots(): void {
    for (const [id, slot] of this.slots) {
      if (this.frame - slot.lastSeenFrame > 240 && !slot.hasCustomAppearance) {
        this.disposeSlot(slot)
        this.slots.delete(id)
        this.lodScheduler.delete(id)
      }
    }
  }
}

function setFadeSat(assembled: AssembledCharacter, fade: number, sat: number): void {
  assembled.mesh.userData.fade = fade
  assembled.mesh.userData.sat = sat
  for (const extra of assembled.extraMeshes) {
    extra.userData.fade = fade
    extra.userData.sat = sat
  }
}

function computeRigTop(
  slot: CharacterSlot,
  assembled: AssembledCharacter,
  clipName: string,
  scale: number,
): number {
  if (clipName === 'sleep_bed') return 0.55 * scale
  if (assembled.attach.head) {
    assembled.attach.head.getWorldPosition(TMP_HEAD_WORLD)
    const relY = TMP_HEAD_WORLD.y - slot.wrapper.position.y + 0.18 * scale
    if (Number.isFinite(relY) && relY > 0.35) {
      return relY
    }
  }
  return RIG_DEFAULT_TOP * scale
}

export interface CharacterVisualAction {
  pose: string
  seated?: boolean
  speed01?: number
  carrying?: PersonVisualInput['carrying']
  opacity?: number
  saturation?: number
  hovered?: boolean
  selected?: boolean
  followed?: boolean
  floorIndex?: number
}

export interface CharacterVisualTransform {
  x: number
  y: number
  z: number
  yaw: number
}

export interface CharacterVisualProps {
  employeeId: EmployeeId
  transformRef: MutableRefObject<CharacterVisualTransform>
  actionRef: MutableRefObject<CharacterVisualAction>
  carrying?: PersonVisualInput['carrying']
  selected?: boolean
  lodHint?: 0 | 1 | 2
}

/**
 * Single-character React/R3F wrapper around `CharacterPeople` for isolated
 * inspection or preview scenes.
 */
export function CharacterVisual({
  employeeId,
  transformRef,
  actionRef,
  carrying = null,
  selected = false,
  lodHint = 0,
}: CharacterVisualProps) {
  const { camera } = useThree()
  const system = useMemo(() => new CharacterPeople({ capacity: 1 }), [])
  const scratchInput = useRef<PersonVisualInput>({
    id: employeeId,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pose: 'stand',
    seated: false,
    speed01: 0,
    carrying: null,
    tintSwatch: 'management',
    status: null,
    platformKey: null,
    emote: null,
    saturation: 1,
    floorIndex: 0,
    hovered: false,
    selected: false,
    followed: false,
    opacity: 1,
    lod: 0,
  })

  useEffect(() => {
    return () => {
      system.dispose()
    }
  }, [system])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const tr = transformRef.current
    const act = actionRef.current
    const input = scratchInput.current
    input.id = employeeId
    input.x = tr.x
    input.y = tr.y
    input.z = tr.z
    input.yaw = tr.yaw
    input.pose = (act.pose as PersonVisualInput['pose']) ?? 'stand'
    input.seated = Boolean(act.seated)
    input.speed01 = act.speed01 ?? 0
    input.carrying = act.carrying ?? carrying
    input.selected = act.selected ?? selected
    input.hovered = Boolean(act.hovered)
    input.followed = Boolean(act.followed)
    input.opacity = act.opacity ?? 1
    input.saturation = act.saturation ?? 1
    input.floorIndex = act.floorIndex ?? 0
    input.lod = lodHint

    system.setCamera(camera)
    system.sync([input], 1, dt)
  })

  return <primitive object={system.object} />
}

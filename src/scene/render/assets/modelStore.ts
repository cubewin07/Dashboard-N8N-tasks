import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { AssetManifestSchema, assetUrl, type AssetManifest } from './manifest'

/**
 * Loads P06a GLBs once and hands out plain geometry per shared material, ready
 * for instancing. A file that fails to load is marked `error`; its slots keep
 * their blockout box (P06b R2) and nothing else is affected.
 */
export type MaterialKind = 'palette' | 'glass' | 'emissive'

export interface ModelPart {
  kind: MaterialKind
  geometry: THREE.BufferGeometry
}

type ModelStatus = 'loading' | 'ready' | 'error'

interface ModelNode {
  /** Node label: '' for the model's body, else e.g. `screen`, `hand_hour`. */
  name: string
  kind: MaterialKind
  geometry: THREE.BufferGeometry
  /** Where the node's own origin sits in model space (its pivot). */
  pivot: [number, number, number]
}

interface ModelRecord {
  status: ModelStatus
  /** Geometry per named child node, in model space, before merging. */
  nodes: ModelNode[]
  merged: Map<string, ModelPart[]>
  pivoted: Map<string, NodeParts>
}

/** One named node on its own, with its geometry moved so the pivot is the origin. */
export interface NodeParts {
  parts: ModelPart[]
  pivot: [number, number, number]
}

const MAX_CONCURRENT = 6
const records = new Map<string, ModelRecord>()
const queue: string[] = []
const listeners = new Set<() => void>()
let active = 0
let version = 0
let manifest: AssetManifest | null = null
let manifestPromise: Promise<AssetManifest | null> | null = null
let manifestFailed = false

const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)

function emit() {
  version += 1
  listeners.forEach((fn) => fn())
}

export function subscribeModels(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getModelsVersion(): number {
  return version
}

export function getManifest(): AssetManifest | null {
  return manifest
}

export function loadManifest(): Promise<AssetManifest | null> {
  manifestPromise ??= fetch(assetUrl('manifest.json'))
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((json: unknown) => {
      manifest = AssetManifestSchema.parse(json)
      emit()
      return manifest
    })
    .catch((err: unknown) => {
      console.warn('[assets] manifest.json could not be loaded; showing blockout only', err)
      manifestFailed = true
      emit()
      return null
    })
  return manifestPromise
}

function materialKind(material: THREE.Material | THREE.Material[]): MaterialKind {
  const name = Array.isArray(material) ? (material[0]?.name ?? '') : material.name
  if (name === 'M_Glass') return 'glass'
  if (name === 'M_Emissive') return 'emissive'
  return 'palette'
}

/** Float copy of one attribute with the node transform baked in. */
function bakeGeometry(mesh: THREE.Mesh, toRoot: THREE.Matrix4): THREE.BufferGeometry {
  const src = mesh.geometry
  const out = new THREE.BufferGeometry()
  const copy = (name: string, size: number) => {
    const attr = src.getAttribute(name)
    if (!attr) return
    const data = new Float32Array(attr.count * size)
    for (let i = 0; i < attr.count; i += 1) {
      data[i * size] = attr.getX(i)
      data[i * size + 1] = attr.getY(i)
      if (size > 2) data[i * size + 2] = attr.getZ(i)
    }
    out.setAttribute(name, new THREE.BufferAttribute(data, size))
  }
  copy('position', 3)
  copy('normal', 3)
  copy('uv', 2)
  // Baked ambient occlusion (COLOR_0, P06b-T13). White when a file has none,
  // so every part carries the attribute and parts still merge.
  const count0 = src.getAttribute('position')?.count ?? 0
  const ao = src.getAttribute('color')
  const colour = new Float32Array(count0 * 3).fill(1)
  if (ao) {
    for (let i = 0; i < ao.count; i += 1) {
      colour[i * 3] = ao.getX(i)
      colour[i * 3 + 1] = ao.getY(i)
      colour[i * 3 + 2] = ao.getZ(i)
    }
  }
  out.setAttribute('color', new THREE.BufferAttribute(colour, 3))
  // Always indexed, so any set of parts can be merged into one geometry.
  const count = src.getAttribute('position')?.count ?? 0
  out.setIndex(src.index ? Array.from(src.index.array) : Array.from({ length: count }, (_, i) => i))
  out.applyMatrix4(toRoot)
  if (!out.getAttribute('normal')) out.computeVertexNormals()
  return out
}

/**
 * Label of a mesh inside a model file: the generator names a part `<model>_<part>`
 * or `<part>`, and its mesh child `<…>_mesh`. The body comes out as ''.
 */
export function nodeLabel(rawName: string, modelName: string): string {
  let name = rawName
  if (name === modelName) return ''
  if (name.startsWith(`${modelName}_`)) name = name.slice(modelName.length + 1)
  if (name === 'mesh') return ''
  return name.endsWith('_mesh') ? name.slice(0, -'_mesh'.length) : name
}

const pivotVec = new THREE.Vector3()

function extract(scene: THREE.Object3D, modelName: string): ModelNode[] {
  scene.updateMatrixWorld(true)
  const nodes: ModelNode[] = []
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    // A `<part>_mesh` child hangs under the empty that is the part's pivot.
    const holder = obj.name.endsWith('_mesh') && obj.parent ? obj.parent : obj
    pivotVec.setFromMatrixPosition(holder.matrixWorld)
    nodes.push({
      name: nodeLabel(obj.name || obj.parent?.name || '', modelName),
      kind: materialKind(obj.material),
      geometry: bakeGeometry(obj, obj.matrixWorld),
      pivot: [pivotVec.x, pivotVec.y, pivotVec.z],
    })
  })
  return nodes
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const name = queue.shift()
    if (!name) break
    const entry = manifest?.files[name]
    const record = records.get(name)
    if (!record) continue
    if (!entry) {
      record.status = 'error'
      console.warn(`[assets] "${name}" is not in manifest.json; using blockout`)
      emit()
      continue
    }
    active += 1
    loader
      .loadAsync(assetUrl(entry.file))
      .then((gltf) => {
        record.nodes = extract(gltf.scene, name)
        record.status = 'ready'
      })
      .catch((err: unknown) => {
        record.status = 'error'
        console.warn(`[assets] "${entry.file}" failed to load; using blockout`, err)
      })
      .finally(() => {
        active -= 1
        emit()
        pump()
      })
  }
}

/** Queue models for loading, in the given order. Already known names are skipped. */
export function requestModels(names: readonly string[]): void {
  for (const name of names) {
    if (records.has(name)) continue
    records.set(name, { status: 'loading', nodes: [], merged: new Map(), pivoted: new Map() })
    queue.push(name)
  }
  pump()
}

export function isModelReady(name: string): boolean {
  return records.get(name)?.status === 'ready'
}

/** Loaded or failed: nothing more will arrive for this model. */
export function isModelSettled(name: string): boolean {
  const status = records.get(name)?.status
  return status === 'ready' || status === 'error'
}

export interface LoadProgress {
  done: number
  total: number
  /** Nothing more will arrive: all files settled, or there is no manifest at all. */
  settled: boolean
}

export function getLoadProgress(): LoadProgress {
  let done = 0
  records.forEach((r) => {
    if (r.status !== 'loading') done += 1
  })
  const total = records.size
  return { done, total, settled: manifestFailed || (total > 0 && done === total) }
}

function mergeNodes(nodes: readonly ModelNode[]): ModelPart[] {
  const parts: ModelPart[] = []
  for (const kind of ['palette', 'emissive', 'glass'] as const) {
    const geos = nodes.filter((n) => n.kind === kind).map((n) => n.geometry)
    if (geos.length === 0) continue
    const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
    if (geometry) parts.push({ kind, geometry })
  }
  return parts
}

/**
 * One geometry per material for a model in model space: the whole file, a
 * single named node, or the file without the nodes in `omit` (those are drawn
 * by something that animates them).
 */
export function getModelParts(
  name: string,
  node?: string,
  omit?: readonly string[],
): ModelPart[] | null {
  const record = records.get(name)
  if (!record || record.status !== 'ready') return null
  const key = node ?? (omit && omit.length > 0 ? `-${omit.join(',')}` : '*')
  const cached = record.merged.get(key)
  if (cached) return cached
  const parts = mergeNodes(
    record.nodes.filter((n) => (node ? n.name === node : !omit?.includes(n.name))),
  )
  record.merged.set(key, parts)
  return parts
}

/** Does a loaded model have this named node? */
export function hasModelNode(name: string, node: string): boolean {
  return records.get(name)?.nodes.some((n) => n.name === node) ?? false
}

/**
 * A named node with its pivot at the origin, for parts that move on their own
 * (clock hands, fan blades, doors). Place it at `pivot` in model space.
 */
export function getNodeParts(name: string, node: string): NodeParts | null {
  const record = records.get(name)
  if (!record || record.status !== 'ready') return null
  const cached = record.pivoted.get(node)
  if (cached) return cached
  const nodes = record.nodes.filter((n) => n.name === node)
  const first = nodes[0]
  if (!first) return null
  const [px, py, pz] = first.pivot
  const parts = mergeNodes(nodes).map((part) => ({
    kind: part.kind,
    geometry: part.geometry.clone().translate(-px, -py, -pz),
  }))
  const out: NodeParts = { parts, pivot: first.pivot }
  record.pivoted.set(node, out)
  return out
}

/** Test hook: forget everything. */
export function resetModelStore(): void {
  records.clear()
  queue.length = 0
  manifest = null
  manifestPromise = null
  manifestFailed = false
  emit()
}

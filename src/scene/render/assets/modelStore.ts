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

interface ModelRecord {
  status: ModelStatus
  /** Geometry per named child node, before merging. */
  nodes: Array<{ name: string; kind: MaterialKind; geometry: THREE.BufferGeometry }>
  merged: Map<string, ModelPart[]>
}

const MAX_CONCURRENT = 6
const records = new Map<string, ModelRecord>()
const queue: string[] = []
const listeners = new Set<() => void>()
let active = 0
let version = 0
let manifest: AssetManifest | null = null
let manifestPromise: Promise<AssetManifest | null> | null = null

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
  if (src.index) out.setIndex(Array.from(src.index.array))
  out.applyMatrix4(toRoot)
  if (!out.getAttribute('normal')) out.computeVertexNormals()
  return out
}

function nodeLabel(mesh: THREE.Object3D, modelName: string): string {
  const raw = mesh.name || mesh.parent?.name || ''
  const prefix = `${modelName}_`
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw
}

function extract(scene: THREE.Object3D, modelName: string): ModelRecord['nodes'] {
  scene.updateMatrixWorld(true)
  const nodes: ModelRecord['nodes'] = []
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    nodes.push({
      name: nodeLabel(obj, modelName),
      kind: materialKind(obj.material),
      geometry: bakeGeometry(obj, obj.matrixWorld),
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
    records.set(name, { status: 'loading', nodes: [], merged: new Map() })
    queue.push(name)
  }
  pump()
}

export function isModelReady(name: string): boolean {
  return records.get(name)?.status === 'ready'
}

export function getLoadProgress(): { done: number; total: number } {
  let done = 0
  records.forEach((r) => {
    if (r.status !== 'loading') done += 1
  })
  return { done, total: records.size }
}

/** One geometry per material for a model (optionally a single named node). */
export function getModelParts(name: string, node?: string): ModelPart[] | null {
  const record = records.get(name)
  if (!record || record.status !== 'ready') return null
  const key = node ?? '*'
  const cached = record.merged.get(key)
  if (cached) return cached

  const parts: ModelPart[] = []
  for (const kind of ['palette', 'emissive', 'glass'] as const) {
    const geos = record.nodes
      .filter((n) => n.kind === kind && (!node || n.name === node))
      .map((n) => n.geometry)
    if (geos.length === 0) continue
    const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
    if (geometry) parts.push({ kind, geometry })
  }
  record.merged.set(key, parts)
  return parts
}

/** Test hook: forget everything. */
export function resetModelStore(): void {
  records.clear()
  queue.length = 0
  manifest = null
  manifestPromise = null
  emit()
}

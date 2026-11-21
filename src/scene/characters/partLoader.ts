import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import bottomCatalog from '@/content/catalog/bottom.json'
import fullbodyCatalog from '@/content/catalog/fullbody.json'
import glassesCatalog from '@/content/catalog/glasses.json'
import hairCatalog from '@/content/catalog/hair.json'
import neckCatalog from '@/content/catalog/neck.json'
import shoesCatalog from '@/content/catalog/shoes.json'
import topCatalog from '@/content/catalog/top.json'

export type CharacterBase = 'female' | 'male'

export interface BodyBaseMeta {
  tris: number
  regionVertexCounts: Record<string, number>
}

export interface BodyMeta {
  regions: string[]
  bases: Record<CharacterBase, BodyBaseMeta>
}

export interface WardrobeSkinnedBaseMeta {
  file: string
  tris: number
  hideRegions: string[]
  bodyLimits?: Partial<Record<string, [number, number]>>
  maxPenetrationMm?: number
}

export interface WardrobeRigidBaseMeta {
  file: string
  offset: [number, number, number]
  scale: number
}

export interface WardrobeSkinnedMeta {
  id: string
  slot: string
  kind: 'skinned'
  bases: Partial<Record<CharacterBase, WardrobeSkinnedBaseMeta>>
}

export interface WardrobeRigidMeta {
  id: string
  slot: string
  kind: 'rigid'
  bone: string
  merge: boolean
  bases: Partial<Record<CharacterBase, WardrobeRigidBaseMeta>>
}

export type WardrobeMeta = WardrobeSkinnedMeta | WardrobeRigidMeta
export type LoadedMeta = BodyMeta | WardrobeMeta

export interface GltfLikeLoader {
  loadAsync(url: string): Promise<GLTF>
}

export interface FetchResponseLike {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export type FetchLike = (url: string) => Promise<FetchResponseLike>

export interface PartLoaderDeps {
  loader?: GltfLikeLoader
  fetchFn?: FetchLike
  baseUrl?: string
}

export interface PreloadResult {
  models: string[]
  metas: string[]
  errors: Array<{ path: string; error: unknown }>
}

const BODY_META_PATH = 'models/characters/body.meta.json'
const BODY_MODEL_PATHS: Record<CharacterBase, string> = {
  female: 'models/characters/body_female.glb',
  male: 'models/characters/body_male.glb',
}

interface CatalogJsonEntry {
  id: string
  model?: Partial<Record<CharacterBase, string>>
}

const WARDROBE_CATALOGS: ReadonlyArray<{ items: readonly CatalogJsonEntry[] }> = [
  topCatalog,
  bottomCatalog,
  fullbodyCatalog,
  shoesCatalog,
  hairCatalog,
  glassesCatalog,
  neckCatalog,
]

const gltfPromiseCache = new Map<string, Promise<GLTF>>()
const gltfAssetCache = new Map<string, GLTF>()
const metaPromiseCache = new Map<string, Promise<LoadedMeta>>()
const metaAssetCache = new Map<string, LoadedMeta>()

let defaultLoader: GLTFLoader | null = null

function getDefaultLoader(): GLTFLoader {
  if (!defaultLoader) {
    defaultLoader = new GLTFLoader()
    defaultLoader.setMeshoptDecoder(MeshoptDecoder)
  }
  return defaultLoader
}

function getDefaultFetch(): FetchLike {
  return (url: string) => fetch(url)
}

/** Resolve a path relative to `public/assets/` using `import.meta.env.BASE_URL`. */
export function partAssetUrl(relPath: string, baseUrl: string = import.meta.env.BASE_URL): string {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const cleanRel = relPath.replace(/^\/+/, '').replace(/^assets\/+/, '')
  return `${cleanBase}assets/${cleanRel}`
}

function normalizeWardrobeMetaPath(idOrPath: string): string {
  const trimmed = idOrPath.replace(/^\/+/, '')
  if (trimmed.endsWith('.meta.json')) {
    return trimmed.startsWith('models/') ? trimmed : `models/wardrobe/${trimmed}`
  }
  return `models/wardrobe/${trimmed}.meta.json`
}

async function fetchMetaCached<T extends LoadedMeta>(relPath: string, deps?: PartLoaderDeps): Promise<T> {
  const url = partAssetUrl(relPath, deps?.baseUrl)
  const cachedAsset = metaAssetCache.get(url)
  if (cachedAsset) return cachedAsset as T

  const existing = metaPromiseCache.get(url)
  if (existing) return existing as Promise<T>

  const fetchFn = deps?.fetchFn ?? getDefaultFetch()
  const promise = fetchFn(url)
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch metadata "${url}": HTTP ${res.status}`)
      }
      const parsed = (await res.json()) as T
      metaAssetCache.set(url, parsed)
      return parsed
    })
    .catch((err: unknown) => {
      metaPromiseCache.delete(url)
      throw err
    })

  metaPromiseCache.set(url, promise)
  return promise
}

async function loadGltfCached(relPath: string, deps?: PartLoaderDeps): Promise<GLTF> {
  const url = partAssetUrl(relPath, deps?.baseUrl)
  const cachedAsset = gltfAssetCache.get(url)
  if (cachedAsset) return cachedAsset

  const existing = gltfPromiseCache.get(url)
  if (existing) return existing

  const loader = deps?.loader ?? getDefaultLoader()
  const promise = loader
    .loadAsync(url)
    .then((gltf) => {
      gltfAssetCache.set(url, gltf)
      return gltf
    })
    .catch((err: unknown) => {
      gltfPromiseCache.delete(url)
      throw err
    })

  gltfPromiseCache.set(url, promise)
  return promise
}

/** Unique list of all character body & wardrobe GLB paths referenced by the catalog. */
export function listCatalogModelPaths(): string[] {
  const seen = new Set<string>([BODY_MODEL_PATHS.female, BODY_MODEL_PATHS.male])
  for (const catalog of WARDROBE_CATALOGS) {
    for (const item of catalog.items) {
      if (!item.model) continue
      if (item.model.female) seen.add(item.model.female)
      if (item.model.male) seen.add(item.model.male)
    }
  }
  return Array.from(seen)
}

/** Unique list of all wardrobe item ids referenced by the catalog. */
export function listCatalogWardrobeIds(): string[] {
  const seen = new Set<string>()
  for (const catalog of WARDROBE_CATALOGS) {
    for (const item of catalog.items) {
      seen.add(item.id)
    }
  }
  return Array.from(seen)
}

export function loadBodyMeta(deps?: PartLoaderDeps): Promise<BodyMeta> {
  return fetchMetaCached<BodyMeta>(BODY_META_PATH, deps)
}

export function loadWardrobeMeta(idOrPath: string, deps?: PartLoaderDeps): Promise<WardrobeMeta> {
  return fetchMetaCached<WardrobeMeta>(normalizeWardrobeMetaPath(idOrPath), deps)
}

export function loadBodyPart(base: CharacterBase, deps?: PartLoaderDeps): Promise<GLTF> {
  return loadGltfCached(BODY_MODEL_PATHS[base], deps)
}

export async function loadWardrobePart(
  pathOrId: string,
  baseOrDeps?: CharacterBase | PartLoaderDeps,
  maybeDeps?: PartLoaderDeps,
): Promise<GLTF> {
  if (pathOrId.endsWith('.glb')) {
    const deps = typeof baseOrDeps === 'object' ? baseOrDeps : maybeDeps
    return loadGltfCached(pathOrId, deps)
  }

  const base: CharacterBase = baseOrDeps === 'female' || baseOrDeps === 'male' ? baseOrDeps : 'female'
  const deps = typeof baseOrDeps === 'object' ? baseOrDeps : maybeDeps
  const meta = await loadWardrobeMeta(pathOrId, deps)
  const baseEntry = meta.bases[base]
  if (!baseEntry) {
    throw new Error(`Wardrobe item "${pathOrId}" has no "${base}" base`)
  }
  return loadGltfCached(baseEntry.file, deps)
}

/** Preload body meta, all wardrobe metas, and all catalog GLBs into the cache. */
export async function preloadCatalogParts(deps?: PartLoaderDeps): Promise<PreloadResult> {
  const modelPaths = listCatalogModelPaths()
  const wardrobeIds = listCatalogWardrobeIds()

  const loadedModels: string[] = []
  const loadedMetas: string[] = []
  const errors: Array<{ path: string; error: unknown }> = []

  const tasks: Array<Promise<void>> = [
    loadBodyMeta(deps)
      .then(() => {
        loadedMetas.push(BODY_META_PATH)
      })
      .catch((error: unknown) => {
        errors.push({ path: BODY_META_PATH, error })
      }),
    ...wardrobeIds.map((id) => {
      const path = normalizeWardrobeMetaPath(id)
      return loadWardrobeMeta(id, deps)
        .then(() => {
          loadedMetas.push(path)
        })
        .catch((error: unknown) => {
          errors.push({ path, error })
        })
    }),
    ...modelPaths.map((path) =>
      loadGltfCached(path, deps)
        .then(() => {
          loadedModels.push(path)
        })
        .catch((error: unknown) => {
          errors.push({ path, error })
        }),
    ),
  ]

  await Promise.all(tasks)
  return { models: loadedModels, metas: loadedMetas, errors }
}

export function clearPartCache(): void {
  gltfPromiseCache.clear()
  gltfAssetCache.clear()
  metaPromiseCache.clear()
  metaAssetCache.clear()
}

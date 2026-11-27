import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPartCache,
  listCatalogModelPaths,
  listCatalogWardrobeIds,
  loadBodyMeta,
  loadBodyPart,
  loadWardrobeMeta,
  loadWardrobePart,
  partAssetUrl,
  preloadCatalogParts,
  type BodyMeta,
  type PartLoaderDeps,
  type WardrobeMeta,
} from '../partLoader'

function makeFakeGltf(label: string): GLTF {
  const scene = new THREE.Group()
  scene.name = label
  return {
    scene,
    scenes: [scene],
    animations: [],
    cameras: [],
    asset: { version: '2.0' },
    parser: {} as GLTF['parser'],
    userData: {},
  }
}

const SAMPLE_BODY_META: BodyMeta = {
  regions: ['head', 'chest', 'hips'],
  bases: {
    female: { tris: 1790, regionVertexCounts: { head: 143 } },
    male: { tris: 1790, regionVertexCounts: { head: 143 } },
  },
}

const SAMPLE_WARDROBE_META: WardrobeMeta = {
  id: 'top_tshirt_crew_01',
  slot: 'top',
  kind: 'skinned',
  bases: {
    female: {
      file: 'models/wardrobe/top_tshirt_crew_01_f.glb',
      tris: 496,
      hideRegions: ['chest', 'belly'],
      bodyLimits: {},
    },
    male: {
      file: 'models/wardrobe/top_tshirt_crew_01_m.glb',
      tris: 496,
      hideRegions: ['chest', 'belly'],
      bodyLimits: {},
    },
  },
}

describe('partLoader', () => {
  beforeEach(() => {
    clearPartCache()
  })

  afterEach(() => {
    clearPartCache()
  })

  it('builds asset URLs using baseUrl', () => {
    expect(partAssetUrl('models/characters/body_female.glb', '/')).toBe(
      '/assets/models/characters/body_female.glb',
    )
    expect(partAssetUrl('/models/wardrobe/hair_short_01.glb', '/Dashboard-N8N-tasks/')).toBe(
      '/Dashboard-N8N-tasks/assets/models/wardrobe/hair_short_01.glb',
    )
  })

  it('caches body and wardrobe GLB loads so repeated requests hit the loader once', async () => {
    const loadAsync = vi.fn(async (url: string) => makeFakeGltf(url))
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => SAMPLE_WARDROBE_META,
    }))
    const deps: PartLoaderDeps = {
      loader: { loadAsync },
      fetchFn,
      baseUrl: '/app/',
    }

    const [bodyA, bodyB] = await Promise.all([loadBodyPart('female', deps), loadBodyPart('female', deps)])
    const bodyC = await loadBodyPart('female', deps)

    expect(bodyA).toBe(bodyB)
    expect(bodyA).toBe(bodyC)
    expect(loadAsync).toHaveBeenCalledTimes(1)
    expect(loadAsync).toHaveBeenCalledWith('/app/assets/models/characters/body_female.glb')

    const wA = await loadWardrobePart('models/wardrobe/top_tshirt_crew_01_f.glb', deps)
    const wB = await loadWardrobePart('top_tshirt_crew_01', 'female', deps)
    expect(wA).toBe(wB)
    expect(loadAsync).toHaveBeenCalledTimes(2)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('caches body and wardrobe metadata fetches and clears cleanly', async () => {
    const fetchFn = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes('body.meta.json') ? SAMPLE_BODY_META : SAMPLE_WARDROBE_META),
    }))
    const deps: PartLoaderDeps = { fetchFn, baseUrl: '/' }

    const m1 = await loadBodyMeta(deps)
    const m2 = await loadBodyMeta(deps)
    expect(m1).toBe(m2)
    expect(fetchFn).toHaveBeenCalledTimes(1)

    const w1 = await loadWardrobeMeta('top_tshirt_crew_01', deps)
    const w2 = await loadWardrobeMeta('models/wardrobe/top_tshirt_crew_01.meta.json', deps)
    expect(w1).toBe(w2)
    expect(fetchFn).toHaveBeenCalledTimes(2)

    clearPartCache()
    await loadBodyMeta(deps)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('evicts failed loads so retries can succeed', async () => {
    let failNext = true
    const loadAsync = vi.fn(async (url: string) => {
      if (failNext) {
        failNext = false
        throw new Error('network error')
      }
      return makeFakeGltf(url)
    })
    const deps: PartLoaderDeps = { loader: { loadAsync }, baseUrl: '/' }

    await expect(loadBodyPart('male', deps)).rejects.toThrow('network error')
    const recovered = await loadBodyPart('male', deps)
    expect(recovered.scene.name).toBe('/assets/models/characters/body_male.glb')
    expect(loadAsync).toHaveBeenCalledTimes(2)
  })

  it('lists every unique model path in the catalog and all files exist on disk', () => {
    const paths = listCatalogModelPaths()
    expect(paths).toContain('models/characters/body_female.glb')
    expect(paths).toContain('models/characters/body_male.glb')
    expect(paths).toContain('models/wardrobe/top_tshirt_crew_01_f.glb')
    expect(paths).toContain('models/wardrobe/hair_short_01.glb')
    expect(new Set(paths).size).toBe(paths.length)

    const assetsRoot = path.resolve(process.cwd(), 'public/assets')
    for (const rel of paths) {
      expect(fs.existsSync(path.join(assetsRoot, rel)), `Missing GLB: ${rel}`).toBe(true)
    }

    for (const id of listCatalogWardrobeIds()) {
      const metaRel = `models/wardrobe/${id}.meta.json`
      expect(fs.existsSync(path.join(assetsRoot, metaRel)), `Missing meta: ${metaRel}`).toBe(true)
    }
  })

  it('preloads all catalog models and metas with zero duplicate fetches', async () => {
    const loadAsync = vi.fn(async (url: string) => makeFakeGltf(url))
    const fetchFn = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes('body.meta.json')
          ? SAMPLE_BODY_META
          : {
              ...SAMPLE_WARDROBE_META,
              bases: {
                female: { ...SAMPLE_WARDROBE_META.bases.female, file: 'models/wardrobe/top_tshirt_crew_01_f.glb' },
              },
            },
    }))

    const result = await preloadCatalogParts({
      loader: { loadAsync },
      fetchFn,
      baseUrl: '/',
    })

    const expectedModels = listCatalogModelPaths()
    const expectedIds = listCatalogWardrobeIds()
    expect(result.errors).toEqual([])
    expect(result.models).toHaveLength(expectedModels.length)
    expect(result.metas).toHaveLength(expectedIds.length + 1)
    expect(loadAsync).toHaveBeenCalledTimes(expectedModels.length)
    expect(fetchFn).toHaveBeenCalledTimes(expectedIds.length + 1)
  })
})

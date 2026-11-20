import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AppearanceV1 } from '@/domain/appearance'
import type { EmployeeId } from '@/domain/primitives'
import { saveAppearance, configureLocalAppearanceStore } from '@/office/appearanceStore'
import type { PersonVisualInput } from '@/scene/render/PersonVisual'
import { assembleCharacter, type AssembleCharacterInput } from '../assemble'
import { bindSavedAppearances } from '../appearanceSync'
import { CharacterPeople, resolveHairModelPath, type CharacterPeopleDeps } from '../CharacterVisual'
import { DEFAULT_CATALOG, loadCatalog, type CatalogItem } from '../catalog'
import { generateAppearance } from '../generate'
import type { BodyMeta, WardrobeMeta } from '../partLoader'
import bodyFixtureMeta from '../__fixtures__/body_fixture.meta.json'
import hairFixtureMeta from '../__fixtures__/hair_fixture.meta.json'
import glassesFixtureMeta from '../__fixtures__/glasses_fixture.meta.json'
import topFixtureMeta from '../__fixtures__/top_fixture.meta.json'

const FIXTURES_DIR = path.resolve(import.meta.dirname, '../__fixtures__')

async function loadGlb(name: string) {
  const buf = fs.readFileSync(path.join(FIXTURES_DIR, name))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return new GLTFLoader().parseAsync(ab, '')
}

async function flush(turns = 3): Promise<void> {
  for (let i = 0; i < turns; i += 1) await new Promise((r) => setTimeout(r, 0))
}

function input(id: string): PersonVisualInput {
  return {
    id: id as EmployeeId, x: 0, y: 0, z: 0, yaw: 0, pose: 'stand', seated: false, speed01: 0,
    carrying: null, tintSwatch: 'engineering', status: null, platformKey: null, emote: null,
    saturation: 1, floorIndex: 0, hovered: false, selected: false, followed: false, opacity: 1, lod: 0,
  }
}

function extra(partial: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'slot'>): CatalogItem {
  return {
    label: { vi: partial.id, en: partial.id }, bases: ['female', 'male'], model: null,
    thumb: 't.webp', attach: 'skinned', tint: null, hides: [], tags: [], credit: 't', ...partial,
  }
}

const CATALOG = loadCatalog({
  slotFiles: [{
    items: [
      ...DEFAULT_CATALOG.items,
      extra({ id: 'x_blazer', slot: 'outer', requires: ['top', 'fullbody'] }),
      extra({ id: 'x_coat', slot: 'outer', requires: ['fullbody'] }),
      extra({ id: 'x_cap', slot: 'head', attach: { bone: 'Head' } }),
    ],
  }],
})

describe('live appearance (P08b-T12)', () => {
  let bodyScene: THREE.Group
  let topScene: THREE.Group
  let hairScene: THREE.Group
  let glassesScene: THREE.Group
  const loadedPaths: string[] = []

  beforeAll(async () => {
    bodyScene = (await loadGlb('body_fixture.glb')).scene
    topScene = (await loadGlb('top_fixture.glb')).scene
    hairScene = (await loadGlb('hair_fixture.glb')).scene
    glassesScene = (await loadGlb('glasses_fixture.glb')).scene
  })
  beforeEach(() => {
    loadedPaths.length = 0
  })

  function deps(assembled: string[] = [], parts: string[][] = []): CharacterPeopleDeps {
    const bodyMeta: BodyMeta = {
      regions: bodyFixtureMeta.regions,
      bases: { female: { tris: 1, regionVertexCounts: {} }, male: { tris: 1, regionVertexCounts: {} } },
    }
    return {
      catalog: CATALOG,
      loadAnimFn: async () => new Map<string, THREE.AnimationClip>(),
      loadBodyMetaFn: async () => bodyMeta,
      loadBodyPartFn: async () => bodyScene,
      assembleFn: (inp: AssembleCharacterInput) => {
        assembled.push(inp.appearance.hair.item ?? '')
        parts.push((inp.parts ?? []).map((p) => p.id))
        return assembleCharacter(inp)
      },
      loadWardrobeMetaFn: async (id) => {
        if (id.includes('hair')) {
          return {
            id, slot: 'hair', kind: 'rigid', bone: hairFixtureMeta.bone, merge: hairFixtureMeta.merge,
            bases: {
              female: { file: 'models/wardrobe/hair.glb', offset: [0, 0, 0], scale: 1 },
              male: { file: 'models/wardrobe/hair.glb', offset: [0, 0, 0], scale: 1 },
            },
            hatcut: `models/wardrobe/${id}_hatcut.glb`,
          } satisfies WardrobeMeta
        }
        if (id === 'x_cap' || id.includes('glasses')) {
          return {
            id, slot: id === 'x_cap' ? 'head' : 'glasses', kind: 'rigid', bone: glassesFixtureMeta.bone,
            merge: glassesFixtureMeta.merge,
            bases: {
              female: { file: 'models/wardrobe/g.glb', offset: [0, 0, 0], scale: 1 },
              male: { file: 'models/wardrobe/g.glb', offset: [0, 0, 0], scale: 1 },
            },
            ...(id === 'x_cap' ? { hairClip: 'crown' as const } : {}),
          } satisfies WardrobeMeta
        }
        return {
          id, slot: 'top', kind: 'skinned',
          bases: {
            female: { file: 'models/wardrobe/top.glb', tris: 5, hideRegions: topFixtureMeta.bases.female.hideRegions },
            male: { file: 'models/wardrobe/top.glb', tris: 5, hideRegions: topFixtureMeta.bases.female.hideRegions },
          },
        } satisfies WardrobeMeta
      },
      loadWardrobePartFn: async (p) => {
        loadedPaths.push(p)
        if (p.includes('hair')) return hairScene
        if (p.includes('g.glb') || p.includes('glasses')) return glassesScene
        return topScene
      },
    }
  }

  function look(id: string, over: Partial<AppearanceV1['outfit']> = {}, acc: AppearanceV1['accessories'] = {}): AppearanceV1 {
    const d = generateAppearance(id, CATALOG)
    return { ...d, base: 'female', outfit: { ...d.outfit, top: 'top_tshirt_crew_01', fullbody: null, outer: null, ...over }, accessories: acc }
  }

  it('re-assembles only the character whose look changed, exactly once', async () => {
    const hairs: string[] = []
    const system = new CharacterPeople(deps(hairs))
    const a = look('emp_a')
    const b = look('emp_b')
    system.setAppearance('emp_a' as EmployeeId, a)
    system.setAppearance('emp_b' as EmployeeId, b)
    const inputs = [input('emp_a'), input('emp_b')]
    for (let i = 0; i < 4; i += 1) {
      system.sync(inputs, 2, 1 / 60)
      await flush()
    }
    const before = system.getDebugSnapshot()
    expect(before.assemblies).toBe(2)

    // Same doc again: nothing to do.
    system.setAppearance('emp_a' as EmployeeId, a)
    // A new look for emp_a only.
    system.setAppearance('emp_a' as EmployeeId, { ...a, skin: a.skin === 'skin_01' ? 'skin_02' : 'skin_01' })
    for (let i = 0; i < 4; i += 1) {
      system.sync(inputs, 2, 1 / 60)
      await flush()
    }
    expect(system.getDebugSnapshot().assemblies).toBe(3)
    expect(system.getDebugSnapshot().assembled).toBe(2)
    system.dispose()
  })

  it('does not render an outer layer that has nothing under it (requires)', async () => {
    const parts: string[][] = []
    const system = new CharacterPeople(deps([], parts))
    // x_coat needs a fullbody under it, but only a top is worn.
    system.setAppearance('emp_a' as EmployeeId, look('emp_a', { outer: 'x_coat' }))
    system.setAppearance('emp_b' as EmployeeId, look('emp_b', { top: 'top_tshirt_crew_01', outer: 'x_blazer' }))
    const inputs = [input('emp_a'), input('emp_b')]
    for (let i = 0; i < 4; i += 1) {
      system.sync(inputs, 2, 1 / 60)
      await flush()
    }
    expect(parts).toHaveLength(2)
    expect(parts.flat().includes('x_coat')).toBe(false)
    expect(parts.flat().includes('x_blazer')).toBe(true)
    system.dispose()
  })

  it('loads the hat-cut hair under a hat with hairClip crown, the normal hair otherwise', async () => {
    const system = new CharacterPeople(deps())
    system.setAppearance('emp_hat' as EmployeeId, look('emp_hat', {}, { head: 'x_cap' }))
    system.setAppearance('emp_bare' as EmployeeId, look('emp_bare'))
    const inputs = [input('emp_hat'), input('emp_bare')]
    for (let i = 0; i < 4; i += 1) {
      system.sync(inputs, 2, 1 / 60)
      await flush()
    }
    const hair = loadedPaths.filter((p) => p.includes('hair'))
    expect(hair.some((p) => p.endsWith('_hatcut.glb'))).toBe(true)
    expect(hair.some((p) => !p.endsWith('_hatcut.glb'))).toBe(true)
    system.dispose()
  })

  it('resolveHairModelPath only swaps hair, only for crown clips, only with a hatcut file', () => {
    const hair = DEFAULT_CATALOG.byId.get('hair_short_01')!
    const top = DEFAULT_CATALOG.byId.get('top_tshirt_crew_01')!
    const hairMeta = { id: 'h', slot: 'hair', kind: 'rigid', bone: 'Head', merge: true, bases: {}, hatcut: 'h_hatcut.glb' } as WardrobeMeta
    const hat = { id: 'c', slot: 'head', kind: 'rigid', bone: 'Head', merge: true, bases: {}, hairClip: 'crown' } as WardrobeMeta
    expect(resolveHairModelPath(hair, hairMeta, [hairMeta, hat], 'h.glb')).toBe('h_hatcut.glb')
    expect(resolveHairModelPath(hair, hairMeta, [hairMeta], 'h.glb')).toBe('h.glb')
    expect(resolveHairModelPath(top, hairMeta, [hairMeta, hat], 't.glb')).toBe('t.glb')
    const noCut = { ...hairMeta, hatcut: undefined } as WardrobeMeta
    expect(resolveHairModelPath(hair, noCut, [noCut, hat], 'h.glb')).toBe('h.glb')
  })

  it('bindSavedAppearances pushes a saved look to the renderer, touching only that employee', async () => {
    configureLocalAppearanceStore({ storage: new MemStorage(), eventTarget: new EventTarget() })
    const calls: string[] = []
    const off = bindSavedAppearances({ setAppearance: (id) => calls.push(id) })
    expect(calls).toEqual([])
    const a = generateAppearance('emp_a')
    await saveAppearance('emp_a', a, 0)
    expect(calls).toEqual(['emp_a'])
    await saveAppearance('emp_b', generateAppearance('emp_b'), 0)
    expect(calls).toEqual(['emp_a', 'emp_b'])
    const skinB = a.skin === 'skin_02' ? 'skin_04' : 'skin_02'
    await saveAppearance('emp_a', { ...a, skin: skinB }, 1)
    expect(calls).toEqual(['emp_a', 'emp_b', 'emp_a'])
    off()
    await saveAppearance('emp_a', { ...a, skin: skinB === 'skin_04' ? 'skin_06' : 'skin_04' }, 2)
    expect(calls).toHaveLength(3)
  })
})

class MemStorage implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.get(k) ?? null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, v) }
}

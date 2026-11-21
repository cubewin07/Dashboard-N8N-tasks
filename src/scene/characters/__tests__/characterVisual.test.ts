import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { EmployeeId } from '@/domain/primitives'
import type { PersonVisualInput } from '@/scene/render/PersonVisual'
import { seatYOffset } from '../animLibrary'
import { assembleCharacter, type AssembleCharacterInput } from '../assemble'
import { CharacterPeople, resolveCharacterMode, type CharacterPeopleDeps } from '../CharacterVisual'
import type { BodyMeta, WardrobeMeta } from '../partLoader'
import bodyFixtureMeta from '../__fixtures__/body_fixture.meta.json'
import glassesFixtureMeta from '../__fixtures__/glasses_fixture.meta.json'
import hairFixtureMeta from '../__fixtures__/hair_fixture.meta.json'
import topFixtureMeta from '../__fixtures__/top_fixture.meta.json'

const FIXTURES_DIR = path.resolve(import.meta.dirname, '../__fixtures__')

async function loadGlbFixture(filename: string) {
  const buf = fs.readFileSync(path.join(FIXTURES_DIR, filename))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const loader = new GLTFLoader()
  return loader.parseAsync(ab, '')
}

async function flushPromises(turns = 2): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function makeInput(id: string, overrides: Partial<PersonVisualInput> = {}): PersonVisualInput {
  return {
    id: id as EmployeeId,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pose: 'stand',
    seated: false,
    speed01: 0,
    carrying: null,
    tintSwatch: 'engineering',
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
    ...overrides,
  }
}

function makeTestClip(name: string, duration = 1.0): THREE.AnimationClip {
  const track = new THREE.VectorKeyframeTrack('Hips.position', [0, duration], [0, 0.94, 0, 0, 0.94, 0])
  return new THREE.AnimationClip(name, duration, [track])
}

describe('CharacterVisual / CharacterPeople (P07b-T09, T13)', () => {
  let bodyScene: THREE.Group
  let topScene: THREE.Group
  let hairScene: THREE.Group
  let glassesScene: THREE.Group
  let testClips: Map<string, THREE.AnimationClip>

  beforeAll(async () => {
    const [bodyGltf, topGltf, hairGltf, glassesGltf] = await Promise.all([
      loadGlbFixture('body_fixture.glb'),
      loadGlbFixture('top_fixture.glb'),
      loadGlbFixture('hair_fixture.glb'),
      loadGlbFixture('glasses_fixture.glb'),
    ])
    bodyScene = bodyGltf.scene
    topScene = topGltf.scene
    hairScene = hairGltf.scene
    glassesScene = glassesGltf.scene

    testClips = new Map<string, THREE.AnimationClip>([
      ['idle', makeTestClip('idle', 2.0)],
      ['think', makeTestClip('think', 2.0)],
      ['walk', makeTestClip('walk', 1.0)],
      ['carry_walk', makeTestClip('carry_walk', 1.0)],
      ['sit_idle', makeTestClip('sit_idle', 2.0)],
      ['sit_type', makeTestClip('sit_type', 1.6)],
      ['celebrate', makeTestClip('celebrate', 1.8)],
      ['frustrated', makeTestClip('frustrated', 2.0)],
      ['wave', makeTestClip('wave', 1.8)],
    ])
  })

  function makeTestDeps(overrides: Partial<CharacterPeopleDeps> = {}): CharacterPeopleDeps {
    const bodyMeta: BodyMeta = {
      regions: bodyFixtureMeta.regions,
      bases: {
        female: { tris: 100, regionVertexCounts: {} },
        male: { tris: 100, regionVertexCounts: {} },
      },
    }

    return {
      loadAnimFn: async () => testClips,
      loadBodyMetaFn: async () => bodyMeta,
      loadBodyPartFn: async () => bodyScene,
      loadWardrobeMetaFn: async (idOrPath) => {
        if (idOrPath.includes('hair')) {
          return {
            id: idOrPath,
            slot: 'hair',
            kind: 'rigid',
            bone: hairFixtureMeta.bone,
            merge: hairFixtureMeta.merge,
            bases: {
              female: { file: 'models/wardrobe/hair.glb', offset: [0, 0, 0], scale: 1 },
              male: { file: 'models/wardrobe/hair.glb', offset: [0, 0, 0], scale: 1 },
            },
          } satisfies WardrobeMeta
        }
        if (idOrPath.includes('glasses')) {
          return {
            id: idOrPath,
            slot: 'glasses',
            kind: 'rigid',
            bone: glassesFixtureMeta.bone,
            merge: glassesFixtureMeta.merge,
            bases: {
              female: { file: 'models/wardrobe/glasses.glb', offset: [0, 0, 0], scale: 1 },
              male: { file: 'models/wardrobe/glasses.glb', offset: [0, 0, 0], scale: 1 },
            },
          } satisfies WardrobeMeta
        }
        return {
          id: idOrPath,
          slot: 'top',
          kind: 'skinned',
          bases: {
            female: {
              file: 'models/wardrobe/top.glb',
              tris: 50,
              hideRegions: topFixtureMeta.bases.female.hideRegions,
            },
            male: {
              file: 'models/wardrobe/top.glb',
              tris: 50,
              hideRegions: topFixtureMeta.bases.female.hideRegions,
            },
          },
        } satisfies WardrobeMeta
      },
      loadWardrobePartFn: async (pathOrId) => {
        if (pathOrId.includes('hair')) return hairScene
        if (pathOrId.includes('glasses')) return glassesScene
        return topScene
      },
      ...overrides,
    }
  }

  it('T09: resolveCharacterMode reads VITE_CHARACTERS flag with full default', () => {
    expect(resolveCharacterMode(undefined)).toBe('full')
    expect(resolveCharacterMode('')).toBe('full')
    expect(resolveCharacterMode('full')).toBe('full')
    expect(resolveCharacterMode('capsule')).toBe('capsule')
    expect(resolveCharacterMode(' CAPSULE ')).toBe('capsule')
  })

  it('T09: queues progressive assembly at <= 2 characters per frame with capsule fallback while queued', async () => {
    const system = new CharacterPeople(makeTestDeps())
    const inputs = [
      makeInput('emp_1', { x: 0 }),
      makeInput('emp_2', { x: 2 }),
      makeInput('emp_3', { x: 4 }),
      makeInput('emp_4', { x: 6 }),
      makeInput('emp_5', { x: 8 }),
    ]

    // Frame 1: starts at most 2 assemblies; all 5 remain visible via capsule fallback until resolved
    system.sync(inputs, inputs.length, 1 / 60)
    await flushPromises()
    expect(system.getDebugSnapshot()).toMatchObject({
      assembled: 2,
      total: 5,
      queued: 3,
      failed: 0,
      cacheSize: 2,
    })

    const head = new THREE.Vector3()
    for (const inp of inputs) {
      expect(system.headOf(inp.id, head)).toBe(true)
    }

    // Frame 2: starts 2 more -> 4 assembled, 1 queued
    system.sync(inputs, inputs.length, 1 / 60)
    await flushPromises()
    expect(system.getDebugSnapshot()).toMatchObject({
      assembled: 4,
      total: 5,
      queued: 1,
      failed: 0,
    })

    // Frame 3: starts remaining 1 -> all 5 assembled
    system.sync(inputs, inputs.length, 1 / 60)
    await flushPromises()
    expect(system.getDebugSnapshot()).toMatchObject({
      assembled: 5,
      total: 5,
      queued: 0,
      failed: 0,
      cacheSize: 5,
    })

    system.dispose()
  })

  it('R11: failed part load renders capsule fallback and logs console.error once per failed employee', async () => {
    const logger = { error: vi.fn(), warn: vi.fn() }
    let loadCalls = 0
    const system = new CharacterPeople(
      makeTestDeps({
        logger,
        loadWardrobePartFn: async (pathOrId) => {
          loadCalls += 1
          if (loadCalls === 1) {
            throw new Error('404 Not Found: corrupt wardrobe GLB')
          }
          if (pathOrId.includes('hair')) return hairScene
          if (pathOrId.includes('glasses')) return glassesScene
          return topScene
        },
      }),
    )

    const inputs = [
      makeInput('emp_fail', { x: 0, y: 0, z: 0 }),
      makeInput('emp_ok', { x: 5, y: 0, z: 0 }),
    ]

    // Sync across multiple frames: must never crash, never log more than once for emp_fail
    for (let f = 0; f < 5; f += 1) {
      system.sync(inputs, inputs.length, 1 / 60)
      await flushPromises()
    }

    const snap = system.getDebugSnapshot()
    expect(snap.failed).toBe(1)
    expect(snap.assembled).toBe(1)
    expect(snap.total).toBe(2)
    expect(logger.error).toHaveBeenCalledTimes(1)

    // Failed employee still renders capsule fallback, has valid head position, and is pickable
    const head = new THREE.Vector3()
    expect(system.headOf('emp_fail' as EmployeeId, head)).toBe(true)
    const ray = new THREE.Ray(new THREE.Vector3(0, 0.8, 3), new THREE.Vector3(0, 0, -1))
    expect(system.pick(ray)).toBe('emp_fail')

    system.dispose()
  })

  it('R11: setFailUrlForTest triggers capsule fallback + single error log cleanly', async () => {
    const logger = { error: vi.fn(), warn: vi.fn() }
    const system = new CharacterPeople(makeTestDeps({ logger }))
    system.setFailUrlForTest('body_female.glb')

    // Generate an employee guaranteed to use female base via setAppearance
    system.setAppearance('emp_test_fail' as EmployeeId, { v: 1, base: 'female' })
    const inputs = [makeInput('emp_test_fail')]

    for (let f = 0; f < 3; f += 1) {
      system.sync(inputs, 1, 1 / 60)
      await flushPromises()
    }

    expect(system.getDebugSnapshot().failed).toBe(1)
    expect(system.getDebugSnapshot().assembled).toBe(0)
    expect(logger.error).toHaveBeenCalledTimes(1)

    system.dispose()
  })

  it('R12: 50 appearance swaps on an employee disposes all 50 old geometries without leaking', async () => {
    let customDisposeCount = 0
    const activeGeometries = new Set<THREE.BufferGeometry>()
    const system = new CharacterPeople(
      makeTestDeps({
        assembleFn: (input: AssembleCharacterInput) => {
          const result = assembleCharacter(input)
          const origDispose = result.dispose.bind(result)
          activeGeometries.add(result.mesh.geometry)
          return {
            ...result,
            dispose() {
              customDisposeCount += 1
              activeGeometries.delete(result.mesh.geometry)
              origDispose()
            },
          }
        },
      }),
    )

    const empId = 'emp_swap' as EmployeeId
    const inputs = [makeInput(empId)]

    // Initial assembly
    system.sync(inputs, 1, 1 / 60)
    await flushPromises()
    expect(system.getDebugSnapshot().assembled).toBe(1)
    expect(system.disposeCount).toBe(0)
    expect(activeGeometries.size).toBe(1)

    // 50 appearance swaps on the same employee
    const hairColors = ['hair_black', 'hair_auburn', 'hair_blonde', 'hair_brown']
    const skinTones = ['skin_01', 'skin_02', 'skin_03', 'skin_04', 'skin_05']
    for (let i = 0; i < 50; i += 1) {
      system.setAppearance(empId, {
        v: 1,
        base: i % 2 === 0 ? 'female' : 'male',
        skin: skinTones[i % skinTones.length],
        hair: {
          item: 'hair_short_01',
          color: hairColors[i % hairColors.length],
        },
        body: {
          height: (i % 10) / 10,
          build: 0.5,
          muscle: 0.2,
          chest: 0.2,
          hips: 0.2,
          shoulders: 0.2,
        },
      })
      system.sync(inputs, 1, 1 / 60)
      await flushPromises()
    }

    expect(customDisposeCount).toBe(50)
    expect(system.disposeCount).toBe(50)
    expect(activeGeometries.size).toBe(1)
    expect(system.getDebugSnapshot()).toMatchObject({
      assembled: 1,
      cacheSize: 1,
      failed: 0,
      queued: 0,
    })

    system.dispose()
    expect(customDisposeCount).toBe(51)
    expect(activeGeometries.size).toBe(0)
  })

  it('T09/R3/R8: applies seated seatYOffset, camera frustum culling, and hidden floor 0 Hz LOD', async () => {
    const system = new CharacterPeople(makeTestDeps())
    const empId = 'emp_seated' as EmployeeId
    system.setAppearance(empId, {
      v: 1,
      base: 'female',
      body: { height: 1, build: 0.5, muscle: 0, chest: 0, hips: 0, shoulders: 0 },
    })

    const input = makeInput(empId, {
      x: 2,
      y: 0,
      z: 0,
      pose: 'sit_work',
      seated: true,
      opacity: 1,
      floorIndex: 0,
    })

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
    camera.position.set(2, 2, 8)
    camera.lookAt(2, 0.9, 0)
    camera.updateMatrixWorld()
    system.setCamera(camera)

    system.sync([input], 1, 1 / 60)
    await flushPromises()

    // Second frame applies animation & seated offset
    system.sync([input], 1, 1 / 60)
    const wrapper = system.object.getObjectByName(`character-slot-${empId}`)!
    expect(wrapper.visible).toBe(true)
    const expectedOffset = seatYOffset('sit_type', 1.08)
    expect(expectedOffset).not.toBe(0)
    expect(wrapper.position.y).toBeCloseTo(expectedOffset, 5)

    // Move camera to look completely away -> character is outside frustum -> visible = false & 0 Hz
    camera.position.set(2, 2, 8)
    camera.lookAt(2, 0.9, 20)
    camera.updateMatrixWorld()
    system.sync([input], 1, 1 / 60)
    expect(wrapper.visible).toBe(false)

    // Look back at character, then hide floor (opacity = 0) and let fade settle -> visible = false
    camera.lookAt(2, 0.9, 0)
    camera.updateMatrixWorld()
    input.opacity = 0
    for (let f = 0; f < 30; f += 1) {
      system.sync([input], 1, 1 / 60)
    }
    expect(wrapper.visible).toBe(false)

    system.dispose()
  })
})

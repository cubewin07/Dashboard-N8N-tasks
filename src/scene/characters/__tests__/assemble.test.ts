import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import palette3d from '@/content/palette3d.json'
import {
  assembleCharacter,
  bakeMorphGeometry,
  bakeTintColors,
  filterHiddenBodyTriangles,
  getSharedCharacterMaterial,
  mergeRigidPart,
  remapCellUvsInPlace,
  type CharacterAppearanceInput,
  type WardrobePartMeta,
} from '../assemble'
import bodyMeta from '../__fixtures__/body_fixture.meta.json'
import glassesMeta from '../__fixtures__/glasses_fixture.meta.json'
import hairMeta from '../__fixtures__/hair_fixture.meta.json'
import topMeta from '../__fixtures__/top_fixture.meta.json'

const FIXTURES_DIR = path.resolve(import.meta.dirname, '../__fixtures__')

async function loadGlbFixture(filename: string) {
  const buf = fs.readFileSync(path.join(FIXTURES_DIR, filename))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const loader = new GLTFLoader()
  return loader.parseAsync(ab, '')
}

function triCount(geom: THREE.BufferGeometry): number {
  return geom.index
    ? geom.index.count / 3
    : geom.getAttribute('position').count / 3
}

function makeAppearance(
  overrides: Partial<CharacterAppearanceInput> = {},
): CharacterAppearanceInput {
  return {
    base: 'female',
    body: { height: 0.5, build: 0.5, muscle: 0, chest: 0, hips: 0, shoulders: 0 },
    skin: 'skin_03',
    face: {
      eyes: 'eyes_02',
      brows: 'brows_01',
      mouth: 'mouth_01',
      eyeColor: 'eye_blue',
      blush: true,
    },
    hair: {
      item: 'hair_fixture',
      color: 'hair_auburn',
    },
    colors: {
      top_fixture: { primary: 'c_red', secondary: 'c_navy' },
      glasses_fixture: { primary: 'c_jade' },
    },
    ...overrides,
  }
}

describe('assemble (P07b-T05, T06, T07)', () => {
  it('T05: bakes morphs, drops morphAttributes, culls hidden tris, merges to 1 SkinnedMesh with valid skinIndices', async () => {
    const [bodyGltf, topGltf, glassesGltf, hairGltf] = await Promise.all([
      loadGlbFixture('body_fixture.glb'),
      loadGlbFixture('top_fixture.glb'),
      loadGlbFixture('glasses_fixture.glb'),
      loadGlbFixture('hair_fixture.glb'),
    ])

    // Direct bakeMorphGeometry test: Heavy = 0.5 moves chest vertices by +0.025 on X and tilts normal
    const bodyMesh = bodyGltf.scene.getObjectByName('body_fixture_mesh_1') as THREE.SkinnedMesh
    const origChestX = bodyMesh.geometry.getAttribute('position').getX(8)
    const baked = bakeMorphGeometry(
      bodyMesh.geometry,
      { Heavy: 0.5, Chest: 0.5 },
      bodyMesh.morphTargetDictionary,
    )
    expect(Object.keys(baked.morphAttributes)).toHaveLength(0)
    expect(baked.getAttribute('position').getX(8)).toBeCloseTo(origChestX + 0.025, 5)
    const bakedNorm = baked.getAttribute('normal')
    const nLen = Math.hypot(bakedNorm.getX(8), bakedNorm.getY(8), bakedNorm.getZ(8))
    expect(nLen).toBeCloseTo(1.0, 5)
    baked.dispose()

    // Direct filterHiddenBodyTriangles test: region 2 ('chest') hides 2 of 6 body triangles
    const culled = filterHiddenBodyTriangles(bodyMesh.geometry, [2])
    expect(triCount(culled)).toBe(4)
    culled.dispose()

    // Full assembleCharacter
    const assembled = assembleCharacter({
      appearance: makeAppearance({
        body: { height: 1.0, build: 1.0, muscle: 0, chest: 0.5, hips: 0, shoulders: 0 },
      }),
      body: { scene: bodyGltf.scene },
      bodyRegions: bodyMeta.regions,
      parts: [
        {
          id: 'top_fixture',
          slot: 'top',
          asset: topGltf.scene,
          meta: topMeta as WardrobePartMeta,
        },
        {
          id: 'glasses_fixture',
          slot: 'glasses',
          asset: glassesGltf.scene,
          meta: glassesMeta as WardrobePartMeta,
        },
        {
          id: 'hair_fixture',
          slot: 'hair',
          asset: hairGltf.scene,
          meta: hairMeta as WardrobePartMeta,
        },
      ],
    })

    // body(6) - hidden(2) + top(4) + glasses(2) + hair(4) + face(6) = 20 tris?
    // Wait: hair_fixture has 4 tris (2 quads), glasses has 2 tris, top has 4 tris, body has 6-2=4 tris, face has 6 tris -> 4+4+2+4+6 = 20!
    expect(triCount(assembled.mesh.geometry)).toBe(20)
    expect(assembled.mesh).toBeInstanceOf(THREE.SkinnedMesh)
    expect(assembled.mesh.geometry.groups).toHaveLength(0)
    expect(Object.keys(assembled.mesh.geometry.morphAttributes)).toHaveLength(0)
    expect(assembled.extraMeshes).toHaveLength(0)
    expect(assembled.heightScale).toBeCloseTo(1.08, 5)
    expect(assembled.morphSummary.Heavy).toBeCloseTo(0.8, 5)
    expect(assembled.mesh.geometry.boundingSphere?.center.toArray()).toEqual([0, 0.9, 0])
    expect(assembled.mesh.geometry.boundingSphere?.radius).toBe(1.2)

    // Verify all skinIndex < 31 and skinWeight sums == 1
    const skinIndex = assembled.mesh.geometry.getAttribute('skinIndex')
    const skinWeight = assembled.mesh.geometry.getAttribute('skinWeight')
    for (let i = 0; i < skinIndex.count; i += 1) {
      for (const idx of [
        skinIndex.getX(i),
        skinIndex.getY(i),
        skinIndex.getZ(i),
        skinIndex.getW(i),
      ]) {
        expect(idx).toBeGreaterThanOrEqual(0)
        expect(idx).toBeLessThan(31)
      }
      const wSum =
        skinWeight.getX(i) +
        skinWeight.getY(i) +
        skinWeight.getZ(i) +
        skinWeight.getW(i)
      expect(wSum).toBeCloseTo(1.0, 4)
    }

    assembled.dispose()
  })

  it('T05: fullbody hides top and bottom parts', async () => {
    const [bodyGltf, topGltf] = await Promise.all([
      loadGlbFixture('body_fixture.glb'),
      loadGlbFixture('top_fixture.glb'),
    ])

    const assembled = assembleCharacter({
      appearance: makeAppearance(),
      body: { scene: bodyGltf.scene },
      parts: [
        { id: 'top_fixture', slot: 'top', asset: topGltf.scene, meta: topMeta as { kind: 'skinned' } },
        {
          id: 'fullbody_dress_01',
          slot: 'fullbody',
          asset: topGltf.scene,
          hides: ['top', 'bottom'],
        },
      ],
    })

    // Only body (6, no hideRegions on mock fullbody) + fullbody (4) + face (6) = 16 (top was skipped)
    expect(triCount(assembled.mesh.geometry)).toBe(16)
    assembled.dispose()
  })

  it('T06: bakes tint swatch colors, remaps skin/hair UVs, and shares ONE material instance across 10 characters', async () => {
    const [bodyGltf, topGltf, glassesGltf, hairGltf] = await Promise.all([
      loadGlbFixture('body_fixture.glb'),
      loadGlbFixture('top_fixture.glb'),
      loadGlbFixture('glasses_fixture.glb'),
      loadGlbFixture('hair_fixture.glb'),
    ])

    // Direct bakeTintColors check
    const topGeom = (topGltf.scene.getObjectByName('top_fixture_geo') as THREE.Mesh).geometry.clone()
    bakeTintColors(topGeom, { primary: 'c_red', secondary: 'c_navy' })
    const colAttr = topGeom.getAttribute('color')
    const uvAttr = topGeom.getAttribute('uv')
    const expectedRed = new THREE.Color('#C8322F')
    const expectedNavy = new THREE.Color('#1F2D4D')
    // Primary vertex 0 (shade 1.0)
    expect(colAttr.getX(0)).toBeCloseTo(expectedRed.r, 5)
    expect(colAttr.getY(0)).toBeCloseTo(expectedRed.g, 5)
    expect(colAttr.getZ(0)).toBeCloseTo(expectedRed.b, 5)
    // Tinted UV moved onto `white` cell (col 11, row 1)
    expect(Math.floor(uvAttr.getX(0) * 16)).toBe(11)
    expect(Math.floor(uvAttr.getY(0) * 16)).toBe(1)
    // Secondary vertex 4 (shade 0.8)
    expect(colAttr.getX(4)).toBeCloseTo(expectedNavy.r * 0.8, 4)
    expect(colAttr.getY(4)).toBeCloseTo(expectedNavy.g * 0.8, 4)
    expect(colAttr.getZ(4)).toBeCloseTo(expectedNavy.b * 0.8, 4)
    topGeom.dispose()

    // Direct remapCellUvsInPlace check for skin & hair
    const testUv = new THREE.Float32BufferAttribute(
      [0.5 / 16, 7.5 / 16, 2.5 / 16, 7.5 / 16, 0.5 / 16, 9.5 / 16, 1.5 / 16, 9.5 / 16],
      2,
    )
    remapCellUvsInPlace(testUv, [
      ['skin_01', 'skin_06'],
      ['skin_01_blush', 'skin_06'],
      ['hair_black', 'hair_blonde'],
      ['hair_black_hi', 'hair_blonde_hi'],
    ])
    const skin06 = palette3d.swatches.find((s) => s.key === 'skin_06')!
    const blonde = palette3d.swatches.find((s) => s.key === 'hair_blonde')!
    const blondeHi = palette3d.swatches.find((s) => s.key === 'hair_blonde_hi')!
    expect(Math.floor(testUv.getX(0) * 16)).toBe(skin06.col)
    expect(Math.floor(testUv.getY(0) * 16)).toBe(skin06.row)
    expect(Math.floor(testUv.getX(1) * 16)).toBe(skin06.col)
    expect(Math.floor(testUv.getY(1) * 16)).toBe(skin06.row)
    expect(Math.floor(testUv.getX(2) * 16)).toBe(blonde.col)
    expect(Math.floor(testUv.getY(2) * 16)).toBe(blonde.row)
    expect(Math.floor(testUv.getX(3) * 16)).toBe(blondeHi.col)
    expect(Math.floor(testUv.getY(3) * 16)).toBe(blondeHi.row)

    // 10 assembled characters share === identical single material instance
    const shared = getSharedCharacterMaterial()
    const skins = ['skin_01', 'skin_02', 'skin_03', 'skin_04', 'skin_05']
    const swatches = ['c_red', 'c_navy', 'c_jade', 'c_yellow', 'c_purple']
    const chars = Array.from({ length: 10 }, (_, idx) =>
      assembleCharacter({
        appearance: makeAppearance({
          skin: skins[idx % skins.length]!,
          colors: {
            top_fixture: { primary: swatches[idx % swatches.length]!, secondary: 'c_white' },
            glasses_fixture: { primary: swatches[(idx + 2) % swatches.length]! },
          },
        }),
        body: { scene: bodyGltf.scene },
        parts: [
          { id: 'top_fixture', slot: 'top', asset: topGltf.scene, meta: topMeta as { kind: 'skinned' } },
          { id: 'glasses_fixture', slot: 'glasses', asset: glassesGltf.scene, meta: glassesMeta as { kind: 'rigid'; bone: string; merge: boolean } },
          { id: 'hair_fixture', slot: 'hair', asset: hairGltf.scene, meta: hairMeta as { kind: 'rigid'; bone: string; merge: boolean } },
        ],
      }),
    )

    for (const c of chars) {
      expect(c.mesh.material).toBe(shared)
      // Check per-object fade/sat sync via onBeforeRender
      c.mesh.userData.fade = 0.5
      c.mesh.userData.sat = 0.25
      c.mesh.onBeforeRender(
        null as unknown as THREE.WebGLRenderer,
        null as unknown as THREE.Scene,
        null as unknown as THREE.Camera,
        c.mesh.geometry,
        shared,
        null as unknown as THREE.Group,
      )
      expect(c.mesh.geometry.getAttribute('aFade').getX(0)).toBeCloseTo(0.5, 5)
      expect(c.mesh.geometry.getAttribute('aSat').getX(0)).toBeCloseTo(0.25, 5)
      c.dispose()
    }

    // Verify blush: false remaps skin_01_blush (verts 4..7) to skin_03 instead of skin_03_blush
    const noBlush = assembleCharacter({
      appearance: makeAppearance({
        skin: 'skin_03',
        face: { eyes: 'eyes_01', brows: 'brows_01', mouth: 'mouth_01', eyeColor: 'eye_brown', blush: false },
      }),
      body: { scene: bodyGltf.scene },
    })
    const skin03 = palette3d.swatches.find((s) => s.key === 'skin_03')!
    const noBlushUv = noBlush.mesh.geometry.getAttribute('uv')
    expect(Math.floor(noBlushUv.getX(4) * 16)).toBe(skin03.col)
    expect(Math.floor(noBlushUv.getY(4) * 16)).toBe(skin03.row)
    noBlush.dispose()
  })

  it('T07: rigid glasses follow Head bone rotation in world space and attach bones exist', async () => {
    const [bodyGltf, glassesGltf] = await Promise.all([
      loadGlbFixture('body_fixture.glb'),
      loadGlbFixture('glasses_fixture.glb'),
    ])

    // Verify mergeRigidPart helper assigns boneIndex & [1,0,0,0] weights
    let rawGlassesMesh: THREE.Mesh | null = null
    glassesGltf.scene.traverse((obj) => {
      if (!rawGlassesMesh && obj instanceof THREE.Mesh) rawGlassesMesh = obj
    })
    const rawGlasses = rawGlassesMesh!.geometry
    const rigidMerged = mergeRigidPart(rawGlasses, 6, { offset: [0, 0.02, 0], scale: 1 })
    expect(rigidMerged.getAttribute('skinIndex').getX(0)).toBe(6)
    expect(rigidMerged.getAttribute('skinWeight').getX(0)).toBe(1)
    expect(rigidMerged.getAttribute('position').getY(0)).toBeCloseTo(
      rawGlasses.getAttribute('position').getY(0) + 0.02,
      5,
    )
    rigidMerged.dispose()

    const assembled = assembleCharacter({
      appearance: makeAppearance(),
      body: { scene: bodyGltf.scene },
      parts: [
        {
          id: 'glasses_fixture',
          slot: 'glasses',
          asset: glassesGltf.scene,
          meta: glassesMeta as WardrobePartMeta,
        },
      ],
    })

    expect(assembled.attach.handR?.name).toBe('Attach_HandR')
    expect(assembled.attach.handL?.name).toBe('Attach_HandL')
    expect(assembled.attach.head?.name).toBe('Attach_Head')

    // Glasses vertices start right after body vertices (body has 12 verts)
    const glassesVertIndex = 12
    const restPos = new THREE.Vector3()
    restPos.fromBufferAttribute(assembled.mesh.geometry.getAttribute('position'), glassesVertIndex)
    expect(restPos.z).toBeCloseTo(0.14, 4)

    // Rotate Head bone +90 deg around Y (local +Z moves toward +X)
    const headBone = assembled.skeleton.bones.find((b) => b.name === 'Head')!
    headBone.rotation.y = Math.PI / 2
    assembled.mesh.updateMatrixWorld(true)
    assembled.skeleton.update()

    const posedPos = new THREE.Vector3().copy(restPos)
    assembled.mesh.applyBoneTransform(glassesVertIndex, posedPos)

    // After +90 deg Y rotation around Head at (0, 1.48, 0):
    // old (x = -0.06, z = 0.14) -> new (x = +0.14, z = +0.06), y unchanged at 1.57
    expect(posedPos.x).toBeCloseTo(0.14, 4)
    expect(posedPos.y).toBeCloseTo(restPos.y, 4)
    expect(posedPos.z).toBeCloseTo(0.06, 4)

    assembled.dispose()
  })

  it('T07: supports opt-out merge:false rigid accessory as extraMesh on Head bone', async () => {
    const [bodyGltf, glassesGltf] = await Promise.all([
      loadGlbFixture('body_fixture.glb'),
      loadGlbFixture('glasses_fixture.glb'),
    ])

    const assembled = assembleCharacter({
      appearance: makeAppearance(),
      body: { scene: bodyGltf.scene },
      parts: [
        {
          id: 'glasses_fixture',
          slot: 'glasses',
          asset: glassesGltf.scene,
          meta: { kind: 'rigid', bone: 'Head', merge: false },
        },
      ],
    })

    expect(assembled.extraMeshes).toHaveLength(1)
    const extra = assembled.extraMeshes[0]!
    expect(extra.material).toBe(assembled.mesh.material)

    const headBone = assembled.skeleton.bones.find((b) => b.name === 'Head')!
    headBone.rotation.y = Math.PI / 2
    assembled.mesh.updateMatrixWorld(true)

    const localVert = new THREE.Vector3().fromBufferAttribute(extra.geometry.getAttribute('position'), 0)
    const worldVert = localVert.clone().applyMatrix4(extra.matrixWorld)
    expect(worldVert.x).toBeCloseTo(0.14, 4)
    expect(worldVert.y).toBeCloseTo(1.57, 4)
    expect(worldVert.z).toBeCloseTo(0.06, 4)

    assembled.dispose()
  })
})

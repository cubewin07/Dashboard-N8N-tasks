import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearHeldPropCache,
  HELD_PROP_MODELS,
  loadHeldProp,
  registerHeldPropModel,
  resolveHeldProp,
  syncHeldProp,
} from '../props'

function buildRigWithHandR(): {
  root: THREE.Group
  skeleton: THREE.Skeleton
  rightArm: THREE.Bone
  rightForeArm: THREE.Bone
  rightHand: THREE.Bone
  attachHandR: THREE.Bone
} {
  const root = new THREE.Group()
  const hips = new THREE.Bone()
  hips.name = 'Hips'
  hips.position.set(0, 0.94, 0)

  const spine = new THREE.Bone()
  spine.name = 'Spine'
  spine.position.set(0, 0.09, 0)

  const rightArm = new THREE.Bone()
  rightArm.name = 'RightArm'
  rightArm.position.set(-0.155, 0.335, 0)

  const rightForeArm = new THREE.Bone()
  rightForeArm.name = 'RightForeArm'
  rightForeArm.position.set(-0.19, -0.19, 0)

  const rightHand = new THREE.Bone()
  rightHand.name = 'RightHand'
  rightHand.position.set(-0.175, -0.175, 0)

  const attachHandR = new THREE.Bone()
  attachHandR.name = 'Attach_HandR'
  attachHandR.position.set(-0.05, -0.05, 0.03)

  hips.add(spine)
  spine.add(rightArm)
  rightArm.add(rightForeArm)
  rightForeArm.add(rightHand)
  rightHand.add(attachHandR)
  root.add(hips)

  const skeleton = new THREE.Skeleton([hips, spine, rightArm, rightForeArm, rightHand, attachHandR])
  root.updateMatrixWorld(true)
  skeleton.calculateInverses()

  return { root, skeleton, rightArm, rightForeArm, rightHand, attachHandR }
}

describe('props', () => {
  beforeEach(() => {
    clearHeldPropCache()
  })

  afterEach(() => {
    clearHeldPropCache()
    vi.restoreAllMocks()
  })

  it('maps all held prop kinds to existing GLB files', () => {
    const assetsRoot = path.resolve(process.cwd(), 'public/assets')
    for (const [kind, relPath] of Object.entries(HELD_PROP_MODELS)) {
      expect(
        fs.existsSync(path.join(assetsRoot, relPath)),
        `Missing held prop GLB for "${kind}": ${relPath}`,
      ).toBe(true)
    }
  })

  it('hides laptop, document, and phone when seated at desk-surface clips', () => {
    for (const kind of ['laptop', 'document', 'phone']) {
      expect(resolveHeldProp('walk', kind, false)).toBe(kind)
      expect(resolveHeldProp('sit_idle', kind, true)).toBe(kind)
      for (const clip of ['sit_type', 'sit_read', 'sit_phone', 'sleep_desk', 'sit_work', 'nap_desk']) {
        expect(resolveHeldProp(clip, kind, true)).toBeNull()
      }
      // When not seated, desk-named clips do not hide the carried prop.
      expect(resolveHeldProp('sit_read', kind, false)).toBe(kind)
    }

    // Box/camera are not desk-hidden, unless sleeping.
    expect(resolveHeldProp('sit_type', 'box', true)).toBe('box')
    expect(resolveHeldProp('sleep_bed', 'box', false)).toBeNull()

    // Leisure props resolve from pose/clip.
    expect(resolveHeldProp('play_pingpong', null, false)).toBe('paddle')
    expect(resolveHeldProp('karaoke', null, false)).toBe('mic')
    expect(resolveHeldProp('coffee', null, false)).toBe('cup')
    expect(resolveHeldProp('tea', null, false)).toBe('cup')
    expect(resolveHeldProp('tea', null, true)).toBeNull()
  })

  it('attaches prop to propRoot and follows Attach_HandR world transform after skeleton pose update', () => {
    const fakeProp = new THREE.Group()
    fakeProp.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.02)))
    registerHeldPropModel('document', fakeProp)

    const rig = buildRigWithHandR()
    rig.root.position.set(4, 2, -3)
    rig.root.rotation.y = Math.PI / 4
    rig.root.scale.setScalar(1.06)

    const propRoot = new THREE.Group()
    rig.root.add(propRoot)

    // Pose the right arm & hand, then update skeleton & world matrices.
    rig.rightArm.rotation.set(0.8, 0.2, -0.3)
    rig.rightForeArm.rotation.set(-1.1, 0, 0.1)
    rig.rightHand.rotation.set(0.15, -0.4, 0.2)
    rig.root.updateMatrixWorld(true)
    rig.skeleton.update()

    const visible = syncHeldProp(propRoot, 'document', rig.attachHandR)
    expect(visible).toBe(true)
    expect(propRoot.visible).toBe(true)
    expect(propRoot.children.length).toBe(1)

    const handWorldPos = new THREE.Vector3()
    const handWorldQuat = new THREE.Quaternion()
    rig.attachHandR.getWorldPosition(handWorldPos)
    rig.attachHandR.getWorldQuaternion(handWorldQuat)

    const propWorldPos = new THREE.Vector3()
    const propWorldQuat = new THREE.Quaternion()
    propRoot.getWorldPosition(propWorldPos)
    propRoot.getWorldQuaternion(propWorldQuat)

    expect(propWorldPos.distanceTo(handWorldPos)).toBeLessThan(1e-5)
    expect(Math.abs(propWorldQuat.dot(handWorldQuat))).toBeCloseTo(1, 5)

    // Move the arm again on a subsequent frame and verify prop tracks the new bone world transform.
    rig.rightArm.rotation.set(-0.3, 0.5, 0.4)
    rig.root.updateMatrixWorld(true)
    rig.skeleton.update()
    syncHeldProp(propRoot, 'document', rig.attachHandR)

    rig.attachHandR.getWorldPosition(handWorldPos)
    propRoot.getWorldPosition(propWorldPos)
    expect(propWorldPos.distanceTo(handWorldPos)).toBeLessThan(1e-5)

    // Hiding when resolved prop is null.
    const hidden = syncHeldProp(propRoot, null, rig.attachHandR)
    expect(hidden).toBe(false)
    expect(propRoot.visible).toBe(false)
  })

  it('caches loaded held prop GLTFs so repeated requests hit loader once', async () => {
    const loadAsync = vi.fn(async (url: string) => {
      const scene = new THREE.Group()
      scene.name = url
      return {
        scene,
        scenes: [scene],
        animations: [],
        cameras: [],
        asset: { version: '2.0' },
        parser: {} as GLTF['parser'],
        userData: {},
      }
    })

    const [a, b] = await Promise.all([
      loadHeldProp('cup', { loader: { loadAsync }, baseUrl: '/' }),
      loadHeldProp('cup', { loader: { loadAsync }, baseUrl: '/' }),
    ])
    expect(a).toBe(b)
    expect(loadAsync).toHaveBeenCalledTimes(1)
    expect(loadAsync).toHaveBeenCalledWith('/assets/models/props/held_cup_01.glb')
  })
})

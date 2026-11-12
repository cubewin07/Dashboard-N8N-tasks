import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { EmployeeId } from '@/domain/primitives'
import { POSE_KEYS, isSeatedPose } from '@/scene/director/poses'
import { CapsulePeople } from '../CapsulePeople'
import { CAPSULE, capsulePose, poseTop, restPose, type CapsulePose } from '../capsulePose'
import type { PersonVisualInput } from '../PersonVisual'

function person(id: string, x: number, z: number, over: Partial<PersonVisualInput> = {}): PersonVisualInput {
  return {
    id: id as EmployeeId,
    x,
    y: 0,
    z,
    yaw: 0,
    pose: 'stand',
    seated: false,
    speed01: 0,
    carrying: null,
    tintSwatch: 'cs',
    tone: null,
    hovered: false,
    selected: false,
    followed: false,
    opacity: 1,
    lod: 0,
    ...over,
  }
}

const rayFrom = (x: number, y: number, z: number, tx: number, ty: number, tz: number) =>
  new THREE.Ray(new THREE.Vector3(x, y, z), new THREE.Vector3(tx - x, ty - y, tz - z).normalize())

describe('capsulePose', () => {
  it('gives a finite, bounded pose for every pose key at any time', () => {
    const out = restPose({} as CapsulePose)
    for (const key of POSE_KEYS) {
      for (const t of [0, 0.37, 3.3, 91.2]) {
        capsulePose(key, isSeatedPose(key), t, 0.4, t * 5, 1, 1, out)
        for (const v of Object.values(out)) expect(Number.isFinite(v)).toBe(true)
        expect(Math.abs(out.pitch)).toBeLessThan(1)
        expect(Math.abs(out.roll)).toBeLessThan(0.5)
        expect(out.lift).toBeGreaterThan(-0.05)
        expect(poseTop(out)).toBeGreaterThan(0.5)
      }
    }
  })

  it('seated poses are shorter, the bed pose lies down', () => {
    const out = restPose({} as CapsulePose)
    capsulePose('sit_work', true, 1, 0, 0, 0, 1, out)
    expect(out.squash).toBe(CAPSULE.seatedSquash)
    expect(poseTop(out)).toBeLessThan(CAPSULE.standTop - 0.2)
    capsulePose('sleep_bed', false, 1, 0, 0, 0, 1, out)
    expect(out.lie).toBe(1)
  })

  it('reduced motion keeps the posture and drops the movement', () => {
    const a = restPose({} as CapsulePose)
    const b = restPose({} as CapsulePose)
    for (const key of POSE_KEYS) {
      capsulePose(key, isSeatedPose(key), 1.3, 0.2, 2, 1, 0, a)
      capsulePose(key, isSeatedPose(key), 7.9, 0.2, 9, 1, 0, b)
      // `+ 0` folds −0 into 0.
      for (const k of Object.keys(a) as (keyof CapsulePose)[]) expect(a[k] + 0).toBeCloseTo(b[k] + 0, 10)
    }
  })
})

describe('CapsulePeople', () => {
  it('draws any number of people with five instanced meshes', () => {
    const people = new CapsulePeople(256)
    const inputs = Array.from({ length: 200 }, (_, i) => person(`emp_${i}`, i % 20, Math.floor(i / 20)))
    people.sync(inputs, inputs.length, 0.016)
    const meshes = people.object.children.filter((c) => (c as THREE.InstancedMesh).isInstancedMesh)
    expect(meshes).toHaveLength(5)
    expect(people.object.children).toHaveLength(5)
    for (const mesh of meshes) expect((mesh as THREE.InstancedMesh).count).toBe(200)
    people.dispose()
  })

  it('pick returns the nearest person on the ray and ignores hidden ones', () => {
    const people = new CapsulePeople()
    const inputs = [
      person('emp_far', 0, 0),
      person('emp_near', 0, 2),
      person('emp_side', 3, 0),
      person('emp_hidden', 0, 4, { opacity: 0 }),
    ]
    people.sync(inputs, inputs.length, 0)

    // Looking along −z from in front: hidden (z=4) is skipped, near (z=2) wins over far.
    expect(people.pick(rayFrom(0, 1, 10, 0, 1, 0))).toBe('emp_near')
    expect(people.pick(rayFrom(3, 1, 10, 3, 1, 0))).toBe('emp_side')
    // Between people and above their heads: nobody.
    expect(people.pick(rayFrom(1.5, 1, 10, 1.5, 1, 0))).toBeNull()
    expect(people.pick(rayFrom(0, 3, 10, 0, 3, 0))).toBeNull()

    const head = new THREE.Vector3()
    expect(people.headOf('emp_near' as EmployeeId, head)).toBe(true)
    expect(head.y).toBeCloseTo(CAPSULE.standTop, 1)
    expect(people.headOf('emp_hidden' as EmployeeId, head)).toBe(false)
    people.dispose()
  })
})

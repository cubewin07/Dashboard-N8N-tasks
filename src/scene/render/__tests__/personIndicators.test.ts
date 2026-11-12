import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import type { EmployeeId } from '@/domain/primitives'
import { visualLanguage } from '@/office/visualConfig'
import { CapsulePeople } from '../CapsulePeople'
import { lodRuntime } from '../lod'
import { PersonIndicators } from '../PersonIndicators'
import type { PersonVisualInput } from '../PersonVisual'

function person(i: number, over: Partial<PersonVisualInput>): PersonVisualInput {
  return {
    id: `emp_${i}` as EmployeeId,
    x: i,
    y: 0,
    z: 0,
    yaw: 0,
    pose: 'stand',
    seated: false,
    speed01: 0,
    carrying: null,
    tintSwatch: 'cs',
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
    ...over,
  }
}

const camera = new THREE.Vector3(0, 5, 10)

function run(inputs: PersonVisualInput[]) {
  const people = new CapsulePeople()
  const ind = new PersonIndicators()
  ind.setPlatforms([{ key: 'shopee', badge: { text: 'SP', swatch: 'orange_500' } }])
  people.sync(inputs, inputs.length, 0)
  const counts = { ...ind.sync(inputs, inputs.length, people, camera, 0) }
  return { people, ind, counts }
}

afterEach(() => {
  lodRuntime.bands.length = 0
})

describe('PersonIndicators', () => {
  it('5 working + 5 idle → 5 rings and 5 icons, idle people get none (R1, R2)', () => {
    lodRuntime.bands[0] = 'mid'
    const inputs = [
      ...Array.from({ length: 5 }, (_, i) => person(i, { status: 'working' })),
      ...Array.from({ length: 5 }, (_, i) => person(i + 5, { saturation: visualLanguage.idle.saturation })),
    ]
    const { people, ind, counts } = run(inputs)
    expect(counts.rings).toBe(5)
    expect(counts.icons).toBe(5)
    expect(ind.rings.mesh.count).toBe(5)
    people.dispose()
    ind.dispose()
  })

  it('adds one draw call per indicator kind, however many people (R15)', () => {
    lodRuntime.bands[0] = 'near'
    const inputs = Array.from({ length: 60 }, (_, i) =>
      person(i, { status: 'working', platformKey: 'shopee', emote: 'talk' }),
    )
    const { people, ind, counts } = run(inputs)
    const meshes: THREE.Object3D[] = []
    ind.object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o)
    })
    expect(meshes).toHaveLength(4)
    expect(counts).toEqual({ rings: 60, icons: 60, badges: 60, emotes: visualLanguage.emotes.max })
    people.dispose()
    ind.dispose()
  })

  it('shows icons, badges and emotes only at mid / near; rings stay at far (R12)', () => {
    lodRuntime.bands[0] = 'far'
    const { people, ind, counts } = run([person(0, { status: 'blocked', platformKey: 'shopee', emote: 'stuck' })])
    expect(counts).toEqual({ rings: 1, icons: 0, badges: 0, emotes: 0 })
    people.dispose()
    ind.dispose()
  })

  it('skips hidden people and unknown platforms', () => {
    lodRuntime.bands[0] = 'near'
    const { people, ind, counts } = run([
      person(0, { status: 'working', opacity: 0 }),
      person(1, { status: 'delivering', platformKey: 'nope' }),
    ])
    // delivering has no ring and no icon (visual-language.json).
    expect(counts).toEqual({ rings: 0, icons: 0, badges: 0, emotes: 0 })
    people.dispose()
    ind.dispose()
  })

  it('pulses only blocked rings, and not at all under reduced motion (R14)', () => {
    lodRuntime.bands[0] = 'mid'
    const { people, ind } = run([person(0, { status: 'working' }), person(1, { status: 'blocked' })])
    const pulse = ind.rings.mesh.geometry.getAttribute('aPulse')
    expect(pulse.getX(0)).toBe(-1)
    expect(pulse.getX(1)).toBeGreaterThanOrEqual(0)
    expect(ind.rings.pulseAmplitude).toBe(visualLanguage.ring.pulseAmount)
    expect(visualLanguage.ring.pulseHz).toBeLessThanOrEqual(1)
    ind.setReducedMotion(true)
    expect(ind.rings.pulseAmplitude).toBe(0)
    people.dispose()
    ind.dispose()
  })
})

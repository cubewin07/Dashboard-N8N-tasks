import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { applyGroupFade } from '../FloorFade'

function floorGroup() {
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
  mesh.castShadow = true
  group.add(mesh)
  return { group, mesh, material: mesh.material }
}

describe('applyGroupFade', () => {
  it('recompiles the material when transparency flips, so a faded floor is really see-through', () => {
    const { group, material } = floorGroup()
    const before = material.version
    applyGroupFade(group, 0.15, false)
    expect(material.transparent).toBe(true)
    expect(material.opacity).toBeCloseTo(0.15)
    expect(material.depthWrite).toBe(false)
    expect(material.version).toBeGreaterThan(before)

    // Further opacity steps keep the program (no recompile per frame).
    const faded = material.version
    applyGroupFade(group, 0.1, false)
    expect(material.version).toBe(faded)

    applyGroupFade(group, 1, true)
    expect(material.transparent).toBe(false)
    expect(material.depthWrite).toBe(true)
    expect(material.version).toBeGreaterThan(faded)
  })

  it('hides fully cut-away floors and restores shadows when shown again', () => {
    const { group, mesh } = floorGroup()
    applyGroupFade(group, 0, false)
    expect(mesh.visible).toBe(false)
    expect(mesh.castShadow).toBe(false)
    applyGroupFade(group, 1, true)
    expect(mesh.visible).toBe(true)
    expect(mesh.castShadow).toBe(true)
  })
})

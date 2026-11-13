import * as THREE from 'three'
import type { BuildingLayout } from '@/scene/layout'
import type { CarState } from '@/scene/nav/elevator'
import { elevatorDoorCentre } from '@/scene/nav/routeGraph'
import { TUNING } from '@/scene/director/tuning'
import { toWorldX, toWorldZ } from './coords'
import { useViewStore } from '@/scene/camera/viewStore'
import { getSwatchHex, SCENE_PALETTE } from './palette'
import { activeFloorIndexOf, isCutAway } from './place'
import { FURNITURE_MAP } from './assets/furnitureMap'
import { getSharedMaterials } from './assets/materials'
import { getModelParts, getNodeParts, isModelReady } from './assets/modelStore'

const CAR = { depth: 1.7, height: 2.3, plate: 0.08, door: 0.05 } as const
/** Floor indicator sign above each door (P05-T08, R7). */
const INDICATOR = { w: 0.44, h: 0.24, y: 2.45, inset: 0.3, px: [96, 52] } as const
const INDICATOR_BG = 'neutral_900'
const INDICATOR_DIGITS = 'status_waiting'

/**
 * The number a floor indicator shows for a car at a fractional floor
 * position: the nearest floor, numbered like the floor picker (index + 1).
 */
export function indicatorNumber(position: number, floorCount: number): number {
  const index = Math.min(Math.max(0, floorCount - 1), Math.max(0, Math.round(position)))
  return index + 1
}

interface Indicator {
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
  mesh: THREE.InstancedMesh
  shown: number
}

interface CarVisual {
  group: THREE.Group
  doorA: THREE.Object3D
  doorB: THREE.Object3D
  light: THREE.Object3D
  width: number
  prev: number
  indicator: Indicator | null
  /** Slides the doors; 0 shut, 1 open. Swapped when the car model arrives. */
  slide: (open: number) => void
}

/** Size of `kit.elevatorCar` in its own space (manifest bbox), for fitting the bay. */
const MODEL_CAR = { width: 2.02, depth: 2.0 } as const

/**
 * The moving elevator cars: an open frame (floor, roof, back wall, two
 * sliding doors) so the riders stay visible from the open front of the
 * building. Positions come from the director's `ElevatorSystem`.
 */
export class ElevatorCars {
  readonly object = new THREE.Group()
  private cars: CarVisual[] = []
  private floorHeight = 4
  private layout: BuildingLayout | null = null
  private modelApplied = false
  private cutaway: number | null | undefined = undefined
  private readonly materials: THREE.Material[] = []
  private readonly geometries: THREE.BufferGeometry[] = []

  constructor() {
    this.object.name = 'elevator-cars'
  }

  build(layout: BuildingLayout): void {
    this.clear()
    this.layout = layout
    this.cutaway = undefined
    this.modelApplied = false
    this.floorHeight = layout.floorHeight
    const floor = layout.floors[0]
    if (!floor) return
    const doors = floor.elevatorDoorSlots
    const zs = doors.map((d) => d.z).sort((a, b) => a - b)
    const pitch = zs.length > 1 ? Math.abs(zs[1]! - zs[0]!) : 2.4
    const width = Math.min(2.4, pitch) * 0.8
    const { w, d } = floor.size

    const shell = this.material(new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.elevator.carShell, roughness: 0.6 }))
    const dark = this.material(new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.elevator.carFloor, roughness: 0.8 }))
    const door = this.material(new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.elevator.carDoor, roughness: 0.45, metalness: 0.2 }))
    const plate = this.geometry(new THREE.BoxGeometry(CAR.depth, CAR.plate, width))
    const back = this.geometry(new THREE.BoxGeometry(CAR.plate, CAR.height, width))
    const leaf = this.geometry(new THREE.BoxGeometry(CAR.door, CAR.height - 0.2, width / 2))
    const lamp = this.geometry(new THREE.BoxGeometry(CAR.depth * 0.5, 0.03, width * 0.5))

    const count = Math.min(layout.elevatorCarCount, doors.length)
    for (let i = 0; i < count; i += 1) {
      const centre = elevatorDoorCentre(floor, i)
      const group = new THREE.Group()
      group.name = `elevator-car-${i}`
      group.position.set(
        toWorldX(centre.x + TUNING.elevator.carInset, w),
        0,
        toWorldZ(centre.z, d),
      )

      const base = new THREE.Mesh(plate, dark)
      base.position.y = -CAR.plate / 2 + 0.01
      base.receiveShadow = true
      const roof = new THREE.Mesh(plate, shell)
      roof.position.y = CAR.height
      const wall = new THREE.Mesh(back, shell)
      wall.position.set(CAR.depth / 2 - CAR.plate / 2, CAR.height / 2, 0)
      const lightMaterial = this.material(
        new THREE.MeshBasicMaterial({ color: SCENE_PALETTE.elevator.carLight, toneMapped: false }),
      )
      const light = new THREE.Mesh(lamp, lightMaterial)
      light.position.y = CAR.height - CAR.plate / 2 - 0.02
      const doorA = new THREE.Mesh(leaf, door)
      const doorB = new THREE.Mesh(leaf, door)
      doorA.position.set(-CAR.depth / 2, (CAR.height - 0.2) / 2, -width / 4)
      doorB.position.set(-CAR.depth / 2, (CAR.height - 0.2) / 2, width / 4)
      for (const part of [base, roof, wall, light, doorA, doorB]) part.castShadow = false
      group.add(base, roof, wall, light, doorA, doorB)
      this.object.add(group)
      const slide = (open: number) => {
        // Leaves slide apart along the door line.
        const offset = (width / 4) * (1 + open * 0.96)
        doorA.position.z = -offset
        doorB.position.z = offset
      }
      this.cars.push({ group, doorA, doorB, light, width, prev: 0, indicator: this.indicator(layout, i), slide })
    }
  }

  /**
   * One sign per floor above car `car`'s door, all sharing one small canvas
   * texture that is redrawn only when the car's floor number changes: one
   * draw call per car.
   */
  private indicator(layout: BuildingLayout, car: number): Indicator | null {
    if (typeof document === 'undefined' || layout.floors.length === 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = INDICATOR.px[0]
    canvas.height = INDICATOR.px[1]
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const material = this.material(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }))
    const plane = this.geometry(new THREE.PlaneGeometry(INDICATOR.w, INDICATOR.h))
    const mesh = new THREE.InstancedMesh(plane, material, layout.floors.length)
    mesh.name = `elevator-indicator-${car}`
    mesh.frustumCulled = false
    this.object.add(mesh)
    const indicator: Indicator = { canvas, texture, mesh, shown: -1 }
    this.placeIndicators(indicator, layout, car, null)
    return indicator
  }

  private placeIndicators(ind: Indicator, layout: BuildingLayout, car: number, active: number | null): void {
    const tmp = new THREE.Object3D()
    for (const floor of layout.floors) {
      if (isCutAway(floor.index, active)) {
        tmp.scale.set(0, 0, 0)
      } else {
        const door = elevatorDoorCentre(floor, car)
        // Faces the open front of the building, a step into the floor from the shaft wall.
        tmp.position.set(
          toWorldX(door.x - INDICATOR.inset, floor.size.w),
          floor.y + INDICATOR.y,
          toWorldZ(door.z, floor.size.d),
        )
        tmp.scale.set(1, 1, 1)
      }
      tmp.updateMatrix()
      ind.mesh.setMatrixAt(floor.index, tmp.matrix)
    }
    ind.mesh.instanceMatrix.needsUpdate = true
  }

  private drawIndicator(ind: Indicator, n: number): void {
    if (ind.shown === n) return
    ind.shown = n
    const ctx = ind.canvas.getContext('2d')
    if (!ctx) return
    const [w, h] = INDICATOR.px
    ctx.fillStyle = getSwatchHex(INDICATOR_BG)
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = getSwatchHex(INDICATOR_DIGITS)
    ctx.font = `700 ${Math.round(h * 0.78)}px ui-monospace, Menlo, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), w / 2, h / 2 + 2)
    ind.texture.needsUpdate = true
  }

  /** Call before the director ticks, so cars interpolate like people do. */
  remember(cars: readonly CarState[]): void {
    for (let i = 0; i < this.cars.length; i += 1) {
      const car = cars[i]
      if (car) this.cars[i]!.prev = car.position
    }
  }

  /**
   * Swaps every car's primitive frame for `kit.elevatorCar` once it has
   * loaded (P06b-T06): body in one piece, the two leaves as their own nodes.
   */
  private applyModel(): void {
    this.modelApplied = true
    const model = FURNITURE_MAP.kit.elevatorCar
    const doors = FURNITURE_MAP.life?.elevator
    if (!doors) return
    const body = getModelParts(model, undefined, [doors.doorLeft, doors.doorRight])
    const left = getNodeParts(model, doors.doorLeft)
    const right = getNodeParts(model, doors.doorRight)
    if (!body || !left || !right) return
    const materials = getSharedMaterials()
    for (const car of this.cars) {
      car.group.clear()
      const root = new THREE.Group()
      // The model's front (−Z) faces the floor (−X), like the doors.
      root.rotation.y = Math.PI / 2
      root.scale.set(car.width / MODEL_CAR.width, 1, CAR.depth / MODEL_CAR.depth)
      for (const part of body) {
        const mesh = new THREE.Mesh(part.geometry, materials[part.kind])
        mesh.receiveShadow = part.kind !== 'glass'
        mesh.renderOrder = part.kind === 'glass' ? 2 : 0
        root.add(mesh)
      }
      const leaf = (node: typeof left) => {
        const g = new THREE.Group()
        g.position.set(node.pivot[0], node.pivot[1], node.pivot[2])
        for (const part of node.parts) g.add(new THREE.Mesh(part.geometry, materials[part.kind]))
        root.add(g)
        return g
      }
      const doorL = leaf(left)
      const doorR = leaf(right)
      const leafWidth = Math.abs(right.pivot[0] - left.pivot[0])
      car.group.add(root)
      car.doorA = doorL
      car.doorB = doorR
      car.light = new THREE.Object3D()
      car.slide = (open: number) => {
        doorL.position.x = left.pivot[0] - leafWidth * open * 0.96
        doorR.position.x = right.pivot[0] + leafWidth * open * 0.96
      }
    }
  }

  update(cars: readonly CarState[], alpha: number): void {
    if (!this.modelApplied && this.cars.length > 0 && isModelReady(FURNITURE_MAP.kit.elevatorCar)) {
      this.applyModel()
    }
    const layout = this.layout
    const active = layout ? activeFloorIndexOf(layout, useViewStore.getState()) : null
    const cutawayChanged = active !== this.cutaway
    this.cutaway = active
    for (let i = 0; i < this.cars.length; i += 1) {
      const visual = this.cars[i]!
      const car = cars[i]
      if (!car) {
        visual.group.visible = false
        continue
      }
      visual.group.visible = true
      const position = visual.prev + (car.position - visual.prev) * alpha
      visual.group.position.y = position * this.floorHeight
      const open = car.door01 * car.door01 * (3 - 2 * car.door01)
      visual.slide(open)
      visual.light.visible = car.riders.length > 0 || car.door01 > 0.05
      const ind = visual.indicator
      if (ind && layout) {
        if (cutawayChanged) this.placeIndicators(ind, layout, i, active)
        this.drawIndicator(ind, indicatorNumber(car.position, layout.floors.length))
      }
    }
  }

  private material<T extends THREE.Material>(m: T): T {
    this.materials.push(m)
    return m
  }

  private geometry<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g)
    return g
  }

  private clear(): void {
    this.object.clear()
    for (const car of this.cars) {
      car.indicator?.texture.dispose()
      car.indicator?.mesh.dispose()
    }
    this.cars = []
    for (const m of this.materials) m.dispose()
    for (const g of this.geometries) g.dispose()
    this.materials.length = 0
    this.geometries.length = 0
  }

  dispose(): void {
    this.clear()
  }
}

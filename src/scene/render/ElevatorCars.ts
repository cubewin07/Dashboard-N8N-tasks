import * as THREE from 'three'
import type { BuildingLayout } from '@/scene/layout'
import type { CarState } from '@/scene/nav/elevator'
import { elevatorDoorCentre } from '@/scene/nav/routeGraph'
import { TUNING } from '@/scene/director/tuning'
import { toWorldX, toWorldZ } from './coords'
import { SCENE_PALETTE } from './palette'

const CAR = { depth: 1.7, height: 2.3, plate: 0.08, door: 0.05 } as const

interface CarVisual {
  group: THREE.Group
  doorA: THREE.Mesh
  doorB: THREE.Mesh
  light: THREE.Mesh
  width: number
  prev: number
}

/**
 * The moving elevator cars: an open frame (floor, roof, back wall, two
 * sliding doors) so the riders stay visible from the open front of the
 * building. Positions come from the director's `ElevatorSystem`.
 */
export class ElevatorCars {
  readonly object = new THREE.Group()
  private cars: CarVisual[] = []
  private floorHeight = 4
  private readonly materials: THREE.Material[] = []
  private readonly geometries: THREE.BufferGeometry[] = []

  constructor() {
    this.object.name = 'elevator-cars'
  }

  build(layout: BuildingLayout): void {
    this.clear()
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
      group.add(base, roof, wall, light, doorA, doorB)
      this.object.add(group)
      this.cars.push({ group, doorA, doorB, light, width, prev: 0 })
    }
  }

  /** Call before the director ticks, so cars interpolate like people do. */
  remember(cars: readonly CarState[]): void {
    for (let i = 0; i < this.cars.length; i += 1) {
      const car = cars[i]
      if (car) this.cars[i]!.prev = car.position
    }
  }

  update(cars: readonly CarState[], alpha: number): void {
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
      // Leaves slide apart along the door line.
      const open = car.door01 * car.door01 * (3 - 2 * car.door01)
      const slide = (visual.width / 4) * (1 + open * 0.96)
      visual.doorA.position.z = -slide
      visual.doorB.position.z = slide
      visual.light.visible = car.riders.length > 0 || car.door01 > 0.05
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

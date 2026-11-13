import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { EmployeeId } from '@/domain/primitives'
import { visualLanguage } from '@/office/visualConfig'
import { hashString } from '@/scene/director/rng'
import {
  blendPose,
  CAPSULE,
  capsulePose,
  poseTop,
  restPose,
  type CapsulePose,
} from './capsulePose'
import { FURNITURE_MAP } from './assets/furnitureMap'
import { getSharedMaterials } from './assets/materials'
import { getModelParts, isModelReady } from './assets/modelStore'
import { getSwatchColor, SCENE_PALETTE } from './palette'
import type { PersonVisualInput, PersonVisualSystem } from './PersonVisual'

const PICK_RADIUS = 0.3
/** Walk cycle: radians per metre covered (two steps ≈ 1.3 m). */
const GAIT_PER_METRE = (Math.PI * 2) / 1.3

interface Anim {
  pose: CapsulePose
  phase: number
  gait: number
  lastX: number
  lastZ: number
  fade: number
  ring: number
  sat: number
  seen: number
}

/** Held item box size (m) per kind, from `visual-language.json` (R16). */
const DEFAULT_ITEM: readonly [number, number, number] = [0.2, 0.1, 0.2]
function itemSize(kind: string): readonly [number, number, number] {
  return visualLanguage.heldItems.sizes[kind] ?? DEFAULT_ITEM
}

function paint(geometry: THREE.BufferGeometry, color: (y: number) => THREE.Color): THREE.BufferGeometry {
  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i += 1) {
    const c = color(position.getY(i))
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

const WHITE = new THREE.Color(1, 1, 1)

/** Shirt in the instance (department) colour, trousers in a fixed darker tone. */
function bodyGeometry(): THREE.BufferGeometry {
  const { bodyRadius: r, bodyHeight: h } = CAPSULE
  const g = new THREE.CapsuleGeometry(r, h - r * 2, 4, 12, 6)
  g.translate(0, h / 2, 0)
  // The instance colour multiplies the vertex colour: dividing here is not
  // possible, so the trousers are a grey that darkens whatever the shirt is.
  const legs = new THREE.Color(0.42, 0.42, 0.46)
  return paint(g, (y) => (y < h * 0.4 ? legs : WHITE))
}

/** A head with two eyes, so you can see which way somebody is facing. */
function headGeometry(): THREE.BufferGeometry {
  const r = CAPSULE.headRadius
  const skull = paint(new THREE.SphereGeometry(r, 14, 10), () => WHITE)
  const eyeColor = new THREE.Color(0.14, 0.16, 0.22)
  const parts = [skull]
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(r * 0.17, 6, 5)
    eye.scale(1, 1.35, 0.6)
    eye.translate(side * r * 0.38, r * 0.1, r * 0.9)
    parts.push(paint(eye, () => eyeColor))
  }
  const merged = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  return merged
}

/**
 * Screen-door fade: instead of blending, a faded person keeps only some of
 * its pixels. Stays in the opaque pass (no sorting, shadows keep working).
 * With `saturate`, a per-instance `aSat` also greys the colour (idle people,
 * P05 R2).
 */
function withFade<T extends THREE.Material>(material: T, saturate = false): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        saturate
          ? '#include <common>\nattribute float aFade;\nvarying float vFade;\nattribute float aSat;\nvarying float vSat;'
          : '#include <common>\nattribute float aFade;\nvarying float vFade;',
      )
      .replace(
        '#include <begin_vertex>',
        saturate ? '#include <begin_vertex>\nvFade = aFade;\nvSat = aSat;' : '#include <begin_vertex>\nvFade = aFade;',
      )
    if (saturate) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSat;')
        .replace(
          '#include <color_fragment>',
          [
            '#include <color_fragment>',
            'float satLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));',
            'diffuseColor.rgb = mix(vec3(satLuma), diffuseColor.rgb, vSat);',
          ].join('\n'),
        )
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying float vFade;',
          'float fadeBayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }',
          'float fadeBayer4(vec2 a) { return fadeBayer2(0.5 * a) * 0.25 + fadeBayer2(a); }',
        ].join('\n'),
      )
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif (vFade < 0.995 && vFade <= fadeBayer4(gl_FragCoord.xy)) discard;',
      )
  }
  material.customProgramCacheKey = () => (saturate ? 'people-fade-sat' : 'people-fade')
  return material
}

const tmpMatrix = new THREE.Matrix4()
const tmpLocal = new THREE.Matrix4()
const tmpQuat = new THREE.Quaternion()
const tmpQuat2 = new THREE.Quaternion()
const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ')
const tmpPos = new THREE.Vector3()
const tmpScale = new THREE.Vector3()
const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpTarget: CapsulePose = restPose({} as CapsulePose)
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
const ONE = new THREE.Vector3(1, 1, 1)
const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
/** Held models are authored for someone facing −Z; capsules face +Z. */
const HELD_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
/** How often (frames) to look for newly loaded held-item models. */
const HELD_CHECK_FRAMES = 30

/**
 * The P04 placeholder look: every person is a capsule with a head, drawn
 * with four instanced meshes for the whole building (body, head, held item,
 * selection ring). Poses are transforms only. Status rings, icons, badges
 * and emotes are separate layers (`PersonIndicators`), so they survive the
 * P07b swap.
 */
export class CapsulePeople implements PersonVisualSystem {
  readonly object = new THREE.Group()

  private readonly capacity: number
  private readonly body: THREE.InstancedMesh
  private readonly head: THREE.InstancedMesh
  private readonly carry: THREE.InstancedMesh
  private readonly ring: THREE.InstancedMesh
  private readonly meshes: THREE.InstancedMesh[]
  /** One instanced mesh per carried kind whose model has loaded (P06b-T06). */
  private readonly held = new Map<string, THREE.InstancedMesh>()
  private heldMaterial: THREE.Material | null = null
  private readonly heldUsed = new Set<THREE.InstancedMesh>()
  private readonly fade: THREE.InstancedBufferAttribute
  private readonly sat: THREE.InstancedBufferAttribute
  private readonly depthMaterial: THREE.MeshDepthMaterial

  private readonly anims = new Map<EmployeeId, Anim>()
  private frame = 0
  private time = 0
  private motion = 1

  private count = 0
  private readonly ids: EmployeeId[] = []
  private readonly px: Float32Array
  private readonly py: Float32Array
  private readonly pz: Float32Array
  private readonly top: Float32Array

  constructor(capacity = 160) {
    this.capacity = capacity
    this.object.name = 'people'
    this.px = new Float32Array(capacity)
    this.py = new Float32Array(capacity)
    this.pz = new Float32Array(capacity)
    this.top = new Float32Array(capacity)
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1)
    this.fade.setUsage(THREE.DynamicDrawUsage)
    this.sat = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1)
    this.sat.setUsage(THREE.DynamicDrawUsage)

    this.depthMaterial = withFade(
      new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }),
    )

    const lit = () =>
      withFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }), true)
    const flat = () => withFade(new THREE.MeshBasicMaterial({ toneMapped: false }))

    this.body = this.make('people-body', bodyGeometry(), lit(), false)
    this.head = this.make('people-head', headGeometry(), lit(), false)
    this.carry = this.make(
      'people-carry',
      new THREE.BoxGeometry(1, 1, 1),
      withFade(new THREE.MeshStandardMaterial({ roughness: 0.6 }), true),
      false,
    )
    const ringGeometry = new THREE.RingGeometry(0.34, 0.44, 28)
    this.ring = this.make('people-ring', ringGeometry, flat(), false)
    this.meshes = [this.body, this.head, this.carry, this.ring]
  }

  private make(
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    castShadow: boolean,
  ): THREE.InstancedMesh {
    geometry.setAttribute('aFade', this.fade)
    geometry.setAttribute('aSat', this.sat)
    const mesh = new THREE.InstancedMesh(geometry, material, this.capacity)
    mesh.name = name
    mesh.count = 0
    mesh.frustumCulled = false
    mesh.castShadow = castShadow
    mesh.receiveShadow = castShadow
    if (castShadow) mesh.customDepthMaterial = this.depthMaterial
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Colours exist from the first frame, so the material compiles once.
    mesh.setColorAt(0, WHITE)
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage)
    // People are picked in JS (ray vs capsule), never by three's raycaster.
    mesh.raycast = () => {}
    this.object.add(mesh)
    return mesh
  }

  /** Adds a mesh for each held-item model that has finished loading. */
  private adoptHeldModels(): void {
    const models = FURNITURE_MAP.life?.held
    if (!models) return
    for (const [kind, model] of Object.entries(models)) {
      if (this.held.has(kind) || !isModelReady(model)) continue
      const parts = getModelParts(model)
      if (!parts || parts.length === 0) continue
      // Screens and bodies in one geometry: a carried phone is a few pixels.
      const geometry =
        parts.length === 1
          ? parts[0]!.geometry.clone()
          : mergeGeometries(parts.map((part) => part.geometry), false)
      if (!geometry) continue
      if (!this.heldMaterial) {
        const palette = (getSharedMaterials().palette as THREE.MeshStandardMaterial).map
        this.heldMaterial = withFade(new THREE.MeshStandardMaterial({ map: palette, vertexColors: true, roughness: 0.6 }), true)
      }
      const mesh = this.make(`people-held-${kind}`, geometry, this.heldMaterial, false)
      for (let i = 0; i < this.capacity; i += 1) mesh.setMatrixAt(i, ZERO)
      mesh.visible = false
      this.meshes.push(mesh)
      this.held.set(kind, mesh)
    }
  }

  setReducedMotion(reduced: boolean): void {
    this.motion = reduced ? 0 : 1
  }

  sync(inputs: readonly PersonVisualInput[], count: number, dt: number): void {
    const n = Math.min(count, this.capacity)
    this.frame += 1
    this.time += dt
    const blend = dt > 0 ? 1 - Math.exp(-14 * dt) : 0
    const fadeStep = dt > 0 ? 1 - Math.exp(-9 * dt) : 1
    const fades = this.fade.array as Float32Array
    const sats = this.sat.array as Float32Array
    if (this.frame % HELD_CHECK_FRAMES === 1) this.adoptHeldModels()
    this.heldUsed.clear()

    for (let i = 0; i < n; i += 1) {
      const p = inputs[i]!
      let anim = this.anims.get(p.id)
      if (!anim) {
        anim = {
          pose: capsulePose(p.pose, p.seated, this.time, 0, 0, 0, 0, restPose({} as CapsulePose)),
          phase: (hashString(p.id) % 1000) / 1000,
          gait: 0,
          lastX: p.x,
          lastZ: p.z,
          fade: p.opacity,
          ring: 0,
          sat: p.saturation,
          seen: this.frame,
        }
        this.anims.set(p.id, anim)
      }
      anim.seen = this.frame

      // The walk cycle follows the ground actually covered, so feet never skate.
      const moved = Math.hypot(p.x - anim.lastX, p.z - anim.lastZ)
      anim.lastX = p.x
      anim.lastZ = p.z
      if (dt > 0 && moved < 2) anim.gait += moved * GAIT_PER_METRE

      capsulePose(p.pose, p.seated, this.time, anim.phase, anim.gait, p.speed01, this.motion, tmpTarget)
      if (blend > 0) blendPose(anim.pose, tmpTarget, blend)
      const pose = anim.pose

      anim.fade += (p.opacity - anim.fade) * fadeStep
      const fade = anim.fade < 0.02 ? 0 : anim.fade > 0.98 ? 1 : anim.fade
      fades[i] = fade
      anim.sat += (p.saturation - anim.sat) * fadeStep
      sats[i] = anim.sat

      this.ids[i] = p.id
      this.px[i] = p.x
      this.py[i] = p.y
      this.pz[i] = p.z
      const top = poseTop(pose)
      this.top[i] = top

      if (fade === 0) {
        for (const mesh of this.meshes) mesh.setMatrixAt(i, ZERO)
        continue
      }

      // Body: feet at the logical position, leaning and bobbing around them.
      const sin = Math.sin(p.yaw)
      const cos = Math.cos(p.yaw)
      const lie = pose.lie
      tmpEuler.set(pose.pitch - lie * (Math.PI / 2), p.yaw, pose.roll)
      tmpQuat.setFromEuler(tmpEuler)
      // Lying: the capsule rests on its side, centred on the bed.
      const forward = lie * (CAPSULE.bodyHeight + CAPSULE.headRadius) * 0.5
      tmpPos.set(
        p.x + cos * pose.side + sin * forward,
        p.y + pose.lift + lie * CAPSULE.bodyRadius,
        p.z - sin * pose.side + cos * forward,
      )
      tmpScale.set(1, pose.squash, 1)
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale)
      this.body.setMatrixAt(i, tmpMatrix)

      // Head and hands ride on the unscaled body frame.
      tmpMatrix.compose(tmpPos, tmpQuat, ONE)
      const shoulders = CAPSULE.bodyHeight * pose.squash
      tmpEuler.set(pose.nod, pose.turn, 0)
      tmpQuat2.setFromEuler(tmpEuler)
      tmpA.set(0, shoulders + (CAPSULE.headY - CAPSULE.bodyHeight), Math.sin(pose.nod) * 0.07)
      tmpLocal.compose(tmpA, tmpQuat2, ONE)
      tmpLocal.premultiply(tmpMatrix)
      this.head.setMatrixAt(i, tmpLocal)

      const heldMesh = p.carrying ? this.held.get(p.carrying) : undefined
      for (const mesh of this.held.values()) if (mesh !== heldMesh) mesh.setMatrixAt(i, ZERO)
      if (p.carrying && heldMesh) {
        // The model's `hand_r` anchor is its origin: put it at the hands.
        tmpA.set(0, CAPSULE.carryY * pose.squash, CAPSULE.carryZ + (p.seated ? CAPSULE.seatedReach : 0))
        tmpLocal.compose(tmpA, HELD_TURN, ONE)
        tmpLocal.premultiply(tmpMatrix)
        heldMesh.setMatrixAt(i, tmpLocal)
        heldMesh.setColorAt(i, WHITE)
        this.heldUsed.add(heldMesh)
        this.carry.setMatrixAt(i, ZERO)
      } else if (p.carrying) {
        // Hand anchor (P07b: a bone). Seated, the hands rest further forward,
        // over the desk or the lap.
        const [w, h, d] = itemSize(p.carrying)
        tmpA.set(0, CAPSULE.carryY * pose.squash + h * 0.25, CAPSULE.carryZ + (p.seated ? CAPSULE.seatedReach : 0))
        tmpScale.set(w, h, d)
        tmpQuat2.identity()
        tmpLocal.compose(tmpA, tmpQuat2, tmpScale)
        tmpLocal.premultiply(tmpMatrix)
        this.carry.setMatrixAt(i, tmpLocal)
        this.carry.setColorAt(i, SCENE_PALETTE.people.carry[p.carrying])
      } else {
        this.carry.setMatrixAt(i, ZERO)
      }

      // Colours: department shirt, a skin tone per person.
      this.body.setColorAt(i, getSwatchColor(p.tintSwatch))
      const skin = SCENE_PALETTE.people.skin
      this.head.setColorAt(i, skin[hashString(p.id) % skin.length]!)

      // Ground ring for whoever the boss is pointing at.
      const ringTarget = p.followed ? 1.15 : p.selected ? 1 : p.hovered ? 0.85 : 0
      anim.ring += (ringTarget - anim.ring) * (dt > 0 ? 1 - Math.exp(-16 * dt) : 1)
      if (anim.ring > 0.02) {
        const pulse = p.followed ? 1 + Math.sin(this.time * 4) * 0.06 * this.motion : 1
        tmpPos.set(p.x, p.y + 0.035, p.z)
        tmpScale.setScalar(anim.ring * pulse)
        tmpMatrix.compose(tmpPos, FLAT, tmpScale)
        this.ring.setMatrixAt(i, tmpMatrix)
        this.ring.setColorAt(
          i,
          p.followed
            ? SCENE_PALETTE.people.ringFollowed
            : p.selected
              ? SCENE_PALETTE.people.ringSelected
              : SCENE_PALETTE.people.ringHover,
        )
      } else {
        this.ring.setMatrixAt(i, ZERO)
      }
    }

    this.count = n
    this.ids.length = n
    for (const mesh of this.held.values()) mesh.visible = this.heldUsed.has(mesh)
    for (const mesh of this.meshes) {
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    this.fade.needsUpdate = true
    this.sat.needsUpdate = true

    // Forget people who left (kept a little while, so a re-layout does not reset poses).
    if (this.frame % 120 === 0) {
      for (const [id, anim] of this.anims) {
        if (this.frame - anim.seen > 240) this.anims.delete(id)
      }
    }
  }

  pick(ray: THREE.Ray): EmployeeId | null {
    const fades = this.fade.array as Float32Array
    let best: EmployeeId | null = null
    let bestAlong = Infinity
    for (let i = 0; i < this.count; i += 1) {
      if (fades[i]! < 0.5) continue
      const top = this.top[i]!
      tmpA.set(this.px[i]!, this.py[i]! + 0.15, this.pz[i]!)
      tmpB.set(this.px[i]!, this.py[i]! + Math.max(0.4, top - 0.1), this.pz[i]!)
      const d2 = ray.distanceSqToSegment(tmpA, tmpB, tmpPos)
      if (d2 > PICK_RADIUS * PICK_RADIUS) continue
      const along = tmpPos.distanceToSquared(ray.origin)
      if (along < bestAlong) {
        bestAlong = along
        best = this.ids[i]!
      }
    }
    return best
  }

  headOf(id: EmployeeId, out: THREE.Vector3): boolean {
    return this.headAt(this.ids.indexOf(id), out)
  }

  headAt(index: number, out: THREE.Vector3): boolean {
    if (index < 0 || index >= this.count || (this.fade.array as Float32Array)[index]! < 0.5) return false
    out.set(this.px[index]!, this.py[index]! + this.top[index]!, this.pz[index]!)
    return true
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    }
    this.depthMaterial.dispose()
    this.object.clear()
    this.anims.clear()
  }
}

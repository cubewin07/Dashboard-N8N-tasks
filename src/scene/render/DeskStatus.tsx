import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { EmployeeId } from '@/domain/primitives'
import type { OfficeState } from '@/domain/work'
import { useOffice } from '@/office/store'
import { visualLanguage } from '@/office/visualConfig'
import { useViewStore } from '@/scene/camera/viewStore'
import type { BuildingLayout } from '@/scene/layout'
import { DESK_SLOT_TYPES, deskGlowFor, progressArc, showsProgress } from './deskStatusModel'
import { getSwatchColor } from './palette'
import { activeFloorIndexOf, DESK_TOP, isCutAway, placeInSlot } from './place'

const MONITOR = { w: 0.5, h: 0.32, d: 0.03, z: 0.16, lift: 0.04 } as const
const RING_GAP = 0.12

const tmp = new THREE.Object3D()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)

interface DeskSpot {
  floorIndex: number
  slot: { x: number; z: number; rotY: number }
  slotId: string
}

const RING_VERTEX = /* glsl */ `
attribute float aProgress;
varying vec2 vUv;
varying float vProgress;
void main() {
  vUv = uv;
  vProgress = aProgress;
  vec4 local = vec4(position, 1.0);
#ifdef USE_INSTANCING
  local = instanceMatrix * local;
#endif
  gl_Position = projectionMatrix * modelViewMatrix * local;
}
`

const RING_FRAGMENT = /* glsl */ `
uniform vec3 uFill;
uniform vec3 uTrack;
uniform float uInner;
varying vec2 vUv;
varying float vProgress;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r < uInner || r > 1.0) discard;
  // Clockwise from 12 o'clock, 0..1 (deskStatusModel.arcCovers).
  float a = atan(p.x, p.y);
  if (a < 0.0) a += 6.28318530718;
  vec3 c = (a / 6.28318530718) < vProgress ? uFill : uTrack;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`

export interface DeskStatusProps {
  layout: BuildingLayout
}

/**
 * P05-T04 (R1): a monitor on every desk glowing by its owner's state
 * (off / working / blocked / done) and a progress ring above it whose arc
 * is `task.progress` (a half ring at 0.5). Two instanced draw calls for
 * the whole building; rewritten only when the office state or the cutaway
 * changes.
 */
export function DeskStatus({ layout }: DeskStatusProps) {
  const desks = useMemo(() => {
    const out: DeskSpot[] = []
    for (const floor of layout.floors) {
      for (const slot of floor.slots) {
        if (DESK_SLOT_TYPES.has(slot.type)) out.push({ floorIndex: floor.index, slot, slotId: slot.id })
      }
    }
    return out
  }, [layout])
  const capacity = Math.max(1, desks.length)
  const monitorRef = useRef<THREE.InstancedMesh>(null)
  const ringRef = useRef<THREE.InstancedMesh>(null)
  const lastRef = useRef<{ state: OfficeState | null; active: number | null; desks: DeskSpot[] | null }>({
    state: null,
    active: null,
    desks: null,
  })

  const { radius, width, swatch, trackSwatch } = visualLanguage.progressRing
  const half = radius + width / 2
  const ringGeometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(half * 2, half * 2)
    g.setAttribute('aProgress', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1))
    return g
  }, [half, capacity])
  const ringMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: RING_VERTEX,
        fragmentShader: RING_FRAGMENT,
        side: THREE.DoubleSide,
        toneMapped: false,
        uniforms: {
          uFill: { value: getSwatchColor(swatch).clone() },
          uTrack: { value: getSwatchColor(trackSwatch).clone() },
          uInner: { value: (radius - width / 2) / half },
        },
      }),
    [swatch, trackSwatch, radius, width, half],
  )
  const monitorGeometry = useMemo(() => new THREE.BoxGeometry(MONITOR.w, MONITOR.h, MONITOR.d), [])
  useLayoutEffect(
    () => () => {
      ringGeometry.dispose()
      ringMaterial.dispose()
      monitorGeometry.dispose()
    },
    [ringGeometry, ringMaterial, monitorGeometry],
  )

  // Nothing shows until the first state arrives (no boxes at the origin).
  useLayoutEffect(() => {
    for (const mesh of [monitorRef.current, ringRef.current]) {
      if (!mesh) continue
      for (let i = 0; i < capacity; i += 1) mesh.setMatrixAt(i, ZERO)
      mesh.instanceMatrix.needsUpdate = true
    }
    lastRef.current = { state: null, active: null, desks: null }
  }, [capacity, desks])

  useFrame(() => {
    const monitors = monitorRef.current
    const rings = ringRef.current
    const state = useOffice.getState().state
    if (!monitors || !rings || !state) return
    const active = activeFloorIndexOf(layout, useViewStore.getState())
    const last = lastRef.current
    if (last.state === state && last.active === active && last.desks === desks) return
    lastRef.current = { state, active, desks }

    const progressAttr = rings.geometry.getAttribute('aProgress') as THREE.InstancedBufferAttribute
    const glow = visualLanguage.deskGlow
    for (let i = 0; i < desks.length; i += 1) {
      const desk = desks[i]!
      const floor = layout.floors[desk.floorIndex]
      if (!floor || isCutAway(desk.floorIndex, active)) {
        monitors.setMatrixAt(i, ZERO)
        rings.setMatrixAt(i, ZERO)
        continue
      }
      const ownerId: EmployeeId | undefined = floor.occupants[desk.slotId]
      const person = ownerId ? state.people[ownerId] : undefined
      const task = person?.taskId ? state.tasks[person.taskId] : undefined
      const look = deskGlowFor(person?.activity, task?.status)

      placeInSlot(tmp, floor, desk.slot, [0, DESK_TOP + MONITOR.h / 2 + MONITOR.lift, MONITOR.z])
      tmp.scale.set(1, 1, 1)
      tmp.updateMatrix()
      monitors.setMatrixAt(i, tmp.matrix)
      monitors.setColorAt(i, getSwatchColor(glow[look]))

      if (task && showsProgress(task.status)) {
        placeInSlot(tmp, floor, desk.slot, [
          0,
          DESK_TOP + MONITOR.lift + MONITOR.h + RING_GAP + half,
          MONITOR.z,
        ])
        tmp.scale.set(1, 1, 1)
        tmp.updateMatrix()
        rings.setMatrixAt(i, tmp.matrix)
        progressAttr.setX(i, progressArc(task.progress).fraction)
      } else {
        rings.setMatrixAt(i, ZERO)
      }
    }
    monitors.instanceMatrix.needsUpdate = true
    if (monitors.instanceColor) monitors.instanceColor.needsUpdate = true
    rings.instanceMatrix.needsUpdate = true
    progressAttr.needsUpdate = true
  })

  return (
    <group name="desk-status">
      <instancedMesh
        key={`m${capacity}`}
        ref={monitorRef}
        args={[monitorGeometry, undefined, capacity]}
        frustumCulled={false}
      >
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        key={`r${capacity}`}
        ref={ringRef}
        args={[ringGeometry, ringMaterial, capacity]}
        frustumCulled={false}
      />
    </group>
  )
}

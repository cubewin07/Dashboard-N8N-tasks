import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getFeedClock } from '@/office/store'
import { useViewStore } from '@/scene/camera/viewStore'
import type { BuildingLayout } from '@/scene/layout'
import { clockAngles } from './clock'
import { toWorldX, toWorldZ } from './coords'
import { getSwatchColor } from './palette'
import { LiveNodes, type NodePose } from './LiveNodes'
import { LIFE, useFurniture, useModelReady } from './liveParts'
import { activeFloorIndexOf, isCutAway } from './place'

/** One clock per floor on the back wall (floor-local x share, height, depth). */
const CLOCK = { xShare: 0.4, y: 2.25, wallGap: 0.14, radius: 0.28, depth: 0.04 } as const
const HANDS = {
  hour: { w: 0.035, len: 0.16 },
  minute: { w: 0.022, len: 0.24 },
  depth: 0.012,
} as const
const FACE_SWATCH = 'paper'
const HAND_SWATCH = 'neutral_900'

const tmp = new THREE.Object3D()

export interface WallClockProps {
  layout: BuildingLayout
}

/**
 * P05-T12 (R11): a wall clock on every floor showing feed time in office
 * local time. Two instanced draw calls (faces, hands); hands are rewritten
 * only when the shown minute or the cutaway changes.
 */
export function WallClock({ layout }: WallClockProps) {
  const furniture = useFurniture(layout)
  const clockModel = LIFE?.clock.model
  const ready = useModelReady(clockModel)
  const clocks = useMemo(
    () => furniture.filter((p) => p.model === clockModel),
    [furniture, clockModel],
  )
  if (LIFE && ready && clocks.length > 0) {
    return <ModelClockHands layout={layout} clocks={clocks} />
  }
  return <PrimitiveClocks layout={layout} />
}

/** Time shown on the hands: feed time, per minute; hidden before the feed starts. */
function handPose(which: 'hour' | 'minute'): NodePose {
  return (_p, _i, _t, rotation) => {
    const feed = getFeedClock()
    if (!feed) return false
    const angles = clockAngles(Math.floor(feed.nowMs / 60000) * 60000)
    // The face looks down the model's −Z: +Z rotation reads clockwise from there.
    rotation.set(0, 0, which === 'hour' ? angles.hour : angles.minute)
    return true
  }
}
const HOUR_POSE = handPose('hour')
const MINUTE_POSE = handPose('minute')

function ModelClockHands({
  layout,
  clocks,
}: {
  layout: BuildingLayout
  clocks: Parameters<typeof LiveNodes>[0]['placements']
}) {
  if (!LIFE) return null
  const { model, hour, minute } = LIFE.clock
  return (
    <group name="wall-clocks">
      <LiveNodes name="clock-hours" layout={layout} model={model} node={hour} placements={clocks} pose={HOUR_POSE} />
      <LiveNodes name="clock-minutes" layout={layout} model={model} node={minute} placements={clocks} pose={MINUTE_POSE} />
    </group>
  )
}

/** P05 fallback while the clock model is not loaded. */
function PrimitiveClocks({ layout }: WallClockProps) {
  const faceRef = useRef<THREE.InstancedMesh>(null)
  const handRef = useRef<THREE.InstancedMesh>(null)
  const lastRef = useRef('')
  const count = Math.max(1, layout.floors.length)

  const faceGeometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(CLOCK.radius, CLOCK.radius, CLOCK.depth, 24)
    g.rotateX(Math.PI / 2)
    return g
  }, [])
  // Unit hand pivoting at its base: scaled per instance to hour/minute size.
  const handGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), [])
  useLayoutEffect(
    () => () => {
      faceGeometry.dispose()
      handGeometry.dispose()
    },
    [faceGeometry, handGeometry],
  )

  const centres = useMemo(
    () =>
      layout.floors.map((f) => ({
        x: toWorldX(f.size.w * CLOCK.xShare, f.size.w),
        y: f.y + CLOCK.y,
        z: toWorldZ(f.size.d - CLOCK.wallGap, f.size.d),
      })),
    [layout],
  )

  // Hidden until the feed clock exists (no clocks at the origin).
  useLayoutEffect(() => {
    lastRef.current = ''
    const zero = new THREE.Matrix4().makeScale(0, 0, 0)
    for (const mesh of [faceRef.current, handRef.current]) {
      if (!mesh) continue
      for (let i = 0; i < mesh.count; i += 1) mesh.setMatrixAt(i, zero)
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [centres])

  useFrame(() => {
    const faces = faceRef.current
    const hands = handRef.current
    const feed = getFeedClock()
    if (!faces || !hands || !feed) return
    const minuteMs = Math.floor(feed.nowMs / 60000) * 60000
    const active = activeFloorIndexOf(layout, useViewStore.getState())
    const key = `${minuteMs}|${active}`
    if (key === lastRef.current) return
    lastRef.current = key
    const angles = clockAngles(minuteMs)

    centres.forEach((c, i) => {
      const hidden = isCutAway(i, active)
      tmp.position.set(c.x, c.y, c.z)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.setScalar(hidden ? 0 : 1)
      tmp.updateMatrix()
      faces.setMatrixAt(i, tmp.matrix)

      const hand = (slot: number, angle: number, size: { w: number; len: number }, dz: number) => {
        tmp.position.set(c.x, c.y, c.z + CLOCK.depth / 2 + dz)
        // Clockwise seen from the front (+z): negative rotation about z.
        tmp.rotation.set(0, 0, -angle)
        if (hidden) tmp.scale.set(0, 0, 0)
        else tmp.scale.set(size.w, size.len, HANDS.depth)
        tmp.updateMatrix()
        hands.setMatrixAt(slot, tmp.matrix)
      }
      hand(i * 2, angles.hour, HANDS.hour, HANDS.depth)
      hand(i * 2 + 1, angles.minute, HANDS.minute, HANDS.depth * 2)
    })
    faces.instanceMatrix.needsUpdate = true
    hands.instanceMatrix.needsUpdate = true
  })

  return (
    <group name="wall-clocks">
      <instancedMesh key={`f${count}`} ref={faceRef} args={[faceGeometry, undefined, count]} castShadow={false} frustumCulled={false}>
        <meshStandardMaterial color={getSwatchColor(FACE_SWATCH)} roughness={0.6} />
      </instancedMesh>
      <instancedMesh key={`h${count}`} ref={handRef} args={[handGeometry, undefined, count * 2]} castShadow={false} frustumCulled={false}>
        <meshBasicMaterial color={getSwatchColor(HAND_SWATCH)} />
      </instancedMesh>
    </group>
  )
}

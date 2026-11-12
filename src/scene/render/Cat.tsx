import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getFeedClock } from '@/office/store'
import { visualLanguage } from '@/office/visualConfig'
import { useViewStore } from '@/scene/camera/viewStore'
import type { BuildingLayout } from '@/scene/layout'
import { catAt, catHomes, catLoop } from './catModel'
import { isNight, localMinutes } from './clock'
import { toWorldX, toWorldZ } from './coords'
import { getSwatchColor } from './palette'
import { activeFloorIndexOf, isCutAway } from './place'

const CAT_SWATCH = 'orange_500'

/** Body, head, ears, tail and legs as one merged geometry: one draw call. */
function buildCatGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d)
    if (rx) g.rotateX(rx)
    g.translate(x, y, z)
    parts.push(g)
  }
  box(0.16, 0.12, 0.34, 0, 0.16, 0) // body
  box(0.14, 0.12, 0.12, 0, 0.25, 0.2) // head
  box(0.04, 0.05, 0.03, -0.045, 0.33, 0.2) // ears
  box(0.04, 0.05, 0.03, 0.045, 0.33, 0.2)
  box(0.03, 0.03, 0.22, 0, 0.27, -0.24, -0.7) // tail
  for (const [x, z] of [[-0.05, 0.12], [0.05, 0.12], [-0.05, -0.12], [0.05, -0.12]] as const) {
    box(0.035, 0.1, 0.035, x, 0.05, z)
  }
  const merged = mergeGeometries(parts) ?? new THREE.BoxGeometry(0.16, 0.2, 0.34)
  for (const p of parts) p.dispose()
  return merged
}

export interface CatProps {
  layout: BuildingLayout
  reducedMotion?: boolean
}

/** P05-T12 (R11, D8): the office cat, driven by feed time only. */
export function Cat({ layout, reducedMotion = false }: CatProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => buildCatGeometry(), [])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])
  const plan = useMemo(() => {
    const homes = catHomes(layout)
    return {
      day: homes.day ? { home: homes.day, loop: catLoop(homes.day, 'office-cat') } : null,
      night: homes.night ? { home: homes.night, loop: catLoop(homes.night, 'office-cat') } : null,
    }
  }, [layout])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    const feed = getFeedClock()
    if (!mesh || !feed) return
    const minutes = feed.nowMs / 60000
    const local = localMinutes(feed.nowMs)
    const { dawn, dusk } = visualLanguage.dayNight
    const night = isNight(local, dawn, dusk)
    const entry = night ? plan.night : plan.day
    if (!entry) {
      mesh.visible = false
      return
    }
    // At night it sleeps on one spot of the rest floor (one per night).
    const pose = night
      ? {
          ...catAt(entry.home, entry.loop, 0),
          ...entry.loop[Math.floor(minutes / 1440) % entry.loop.length]!,
          walking: false,
        }
      : catAt(entry.home, entry.loop, minutes)
    const floor = layout.floors[pose.floorIndex]
    const active = activeFloorIndexOf(layout, useViewStore.getState())
    if (!floor || isCutAway(pose.floorIndex, active)) {
      mesh.visible = false
      return
    }
    mesh.visible = true
    const bob = pose.walking && !reducedMotion ? Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.02 : 0
    mesh.position.set(toWorldX(pose.x, floor.size.w), floor.y + bob, toWorldZ(pose.z, floor.size.d))
    // Floor-local heading → world yaw (world z runs opposite to floor z).
    mesh.rotation.set(0, Math.PI - pose.heading, 0)
    mesh.scale.set(1, night ? 0.7 : 1, 1)
  })

  return (
    <mesh ref={meshRef} name="office-cat" geometry={geometry} castShadow visible={false}>
      <meshStandardMaterial color={getSwatchColor(CAT_SWATCH)} roughness={0.8} />
    </mesh>
  )
}

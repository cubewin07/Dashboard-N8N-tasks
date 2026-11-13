import { useEffect, useLayoutEffect, useRef } from 'react'
import type * as THREE from 'three'
import type { BuildingLayout } from '@/scene/layout'
import { SCENE_PALETTE } from './palette'
import { initShadowLight, requestShadowUpdate } from './shadowCache'

/** Noon values; `DayNight` scales and tints from these. */
export const LIGHT_BASE = { hemi: 0.8, sun: 1.25, env: 0.35 } as const

/**
 * The scene's two lights, for `DayNight` to tint imperatively (P05-T12).
 * Not React state.
 */
export const lightRig: {
  hemi: THREE.HemisphereLight | null
  sun: THREE.DirectionalLight | null
} = { hemi: null, sun: null }

export interface LightsProps {
  layout: BuildingLayout
}

const SHADOW_MAP_SIZE = import.meta.env.VITE_E2E ? 1024 : 2048

export function Lights({ layout }: LightsProps) {
  const totalH = layout.totalHeight
  const extentX = Math.max(24, layout.footprint.w * 1.1)
  const extentY = Math.max(24, totalH * 0.85)
  const near = 2
  const far = Math.max(120, totalH * 3 + 60)
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const sunRef = useRef<THREE.DirectionalLight>(null)

  useLayoutEffect(() => {
    lightRig.hemi = hemiRef.current
    lightRig.sun = sunRef.current
    initShadowLight(sunRef.current)
    return () => {
      lightRig.hemi = null
      lightRig.sun = null
    }
  }, [])

  useEffect(() => {
    requestShadowUpdate()
  }, [layout])

  return (
    <group name="scene-lights">
      <hemisphereLight
        ref={hemiRef}
        args={[SCENE_PALETTE.hemiSky, SCENE_PALETTE.hemiGround, LIGHT_BASE.hemi]}
      />
      <directionalLight
        ref={sunRef}
        position={[24, Math.max(36, totalH + 16), 30]}
        intensity={LIGHT_BASE.sun}
        color={SCENE_PALETTE.sunLight}
        castShadow
        shadow-autoUpdate={false}
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-bias={-0.0004}
        shadow-camera-left={-extentX}
        shadow-camera-right={extentX}
        shadow-camera-top={extentY}
        shadow-camera-bottom={-extentY * 0.35}
        shadow-camera-near={near}
        shadow-camera-far={far}
      />
    </group>
  )
}

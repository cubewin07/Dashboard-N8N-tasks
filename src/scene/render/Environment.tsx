import { useEffect, useSyncExternalStore } from 'react'
import { invalidate, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { LIGHT_BASE } from './Lights'
import { SCENE_PALETTE } from './palette'
import {
  createProceduralEnvironment,
  type ProceduralEnvironmentResult,
} from './proceduralEnvironment'

const IS_E2E = Boolean(import.meta.env.VITE_E2E)
const IS_DEBUG_ENABLED =
  import.meta.env.DEV || IS_E2E || Boolean(import.meta.env.VITE_DEBUG)

export const UNLIT_QUAD_POS = [-18, 5, 5] as const

let unlitQuadVisible = false
const quadListeners = new Set<() => void>()

export function setUnlitQuadVisible(visible: boolean): void {
  if (!IS_DEBUG_ENABLED || unlitQuadVisible === visible) return
  unlitQuadVisible = visible
  for (const listener of quadListeners) listener()
  try {
    invalidate()
  } catch {
    // Outside R3F context
  }
}

function subscribeUnlitQuad(listener: () => void): () => void {
  quadListeners.add(listener)
  return () => quadListeners.delete(listener)
}

function getUnlitQuadVisible(): boolean {
  return unlitQuadVisible
}

function bindSceneEnvironment(
  targetScene: THREE.Scene,
  env: ProceduralEnvironmentResult | null,
  intensity: number,
): () => void {
  const envTexture = env?.texture ?? null
  targetScene.environment = envTexture
  targetScene.environmentIntensity = intensity
  return () => {
    if (targetScene.environment === envTexture) {
      targetScene.environment = null
    }
    env?.dispose()
  }
}

export function Environment() {
  const { gl, scene } = useThree()
  const showUnlitQuad = useSyncExternalStore(
    subscribeUnlitQuad,
    getUnlitQuadVisible,
    getUnlitQuadVisible,
  )

  useEffect(() => {
    const env = createProceduralEnvironment(gl)
    return bindSceneEnvironment(scene, env, LIGHT_BASE.env)
  }, [gl, scene])

  return (
    <>
      <color attach="background" args={[SCENE_PALETTE.skyBg]} />
      <group name="environment">
        {/* Ground plaza disc centred on origin */}
        <mesh position={[0, -0.34, 0]} receiveShadow>
          <cylinderGeometry args={[44, 46, 0.08, 48]} />
          <meshStandardMaterial color={SCENE_PALETTE.groundDisc} roughness={0.95} />
        </mesh>

        {/* Subtle outer ring */}
        <mesh position={[0, -0.37, 0]} receiveShadow>
          <cylinderGeometry args={[48, 48, 0.04, 48]} />
          <meshStandardMaterial color={SCENE_PALETTE.groundRing} roughness={0.95} />
        </mesh>

        {/* Acceptance reference: unlit palette swatch jade_600 quad (#0F766E, palette3d.json) */}
        {IS_DEBUG_ENABLED && showUnlitQuad && (
          <mesh
            name="debug-unlit-jade-quad"
            position={UNLIT_QUAD_POS}
            rotation={[-0.35, 0.45, 0.15]}
          >
            <planeGeometry args={[3, 3]} />
            <meshBasicMaterial color="#0F766E" toneMapped={false} />
          </mesh>
        )}
      </group>
    </>
  )
}

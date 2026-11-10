import type { BuildingLayout } from '@/scene/layout'
import { SCENE_PALETTE } from './palette'

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

  return (
    <group name="scene-lights">
      <hemisphereLight
        args={[SCENE_PALETTE.hemiSky, SCENE_PALETTE.hemiGround, 0.95]}
      />
      <directionalLight
        position={[24, Math.max(36, totalH + 16), 30]}
        intensity={1.35}
        color={SCENE_PALETTE.sunLight}
        castShadow
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

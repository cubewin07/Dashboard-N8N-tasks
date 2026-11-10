import type { BuildingLayout } from '@/scene/layout'
import { SCENE_PALETTE } from './palette'

export interface EnvironmentProps {
  layout: BuildingLayout
}

export function Environment({ layout }: EnvironmentProps) {
  const centerX = layout.bounds.max[0] / 2
  const centerZ = layout.bounds.max[2] / 2

  return (
    <group name="environment">
      <color attach="background" args={[SCENE_PALETTE.skyBg]} />

      {/* Ground plaza disc */}
      <mesh position={[centerX, -0.34, centerZ]} receiveShadow>
        <cylinderGeometry args={[44, 46, 0.08, 48]} />
        <meshStandardMaterial color={SCENE_PALETTE.groundDisc} roughness={0.95} />
      </mesh>

      {/* Subtle outer ring */}
      <mesh position={[centerX, -0.37, centerZ]} receiveShadow>
        <cylinderGeometry args={[48, 48, 0.04, 48]} />
        <meshStandardMaterial color={SCENE_PALETTE.groundRing} roughness={0.95} />
      </mesh>
    </group>
  )
}

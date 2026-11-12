import { SCENE_PALETTE } from './palette'

export function Environment() {
  return (
    <group name="environment">
      <color attach="background" args={[SCENE_PALETTE.skyBg]} />

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
    </group>
  )
}

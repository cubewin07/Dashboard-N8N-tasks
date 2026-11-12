import type { BuildingLayout } from '@/scene/layout'
import { toWorldX, toWorldZ } from './coords'
import { SCENE_PALETTE } from './palette'

export interface ElevatorShaftProps {
  layout: BuildingLayout
}

export function ElevatorShaft({ layout }: ElevatorShaftProps) {
  const firstFloor = layout.floors[0]
  if (!firstFloor || firstFloor.elevatorDoorSlots.length === 0) {
    return null
  }

  const { w, d } = firstFloor.size
  const doors = firstFloor.elevatorDoorSlots
  const avgX = doors.reduce((sum, s) => sum + s.x, 0) / doors.length
  const minZ = Math.min(...doors.map((s) => s.z))
  const maxZ = Math.max(...doors.map((s) => s.z))
  const centerZ = toWorldZ((minZ + maxZ) / 2, d)
  const shaftDepth = Math.max(2.4, maxZ - minZ + 1.8)
  const shaftWidth = 1.9
  const shaftCenterX = toWorldX(avgX + 0.95, w)
  const totalH = layout.totalHeight

  return (
    <group name="elevator-shaft">
      {/* Translucent glass elevator shaft spanning all floors */}
      <mesh position={[shaftCenterX, totalH / 2, centerZ]}>
        <boxGeometry args={[shaftWidth, totalH, shaftDepth]} />
        <meshStandardMaterial
          color={SCENE_PALETTE.elevatorShaftGlass}
          transparent
          opacity={0.22}
          depthWrite={false}
          roughness={0.2}
        />
      </mesh>

      {/* Corner vertical rails */}
      {[-shaftWidth / 2, shaftWidth / 2].map((dx) =>
        [-shaftDepth / 2, shaftDepth / 2].map((dz) => (
          <mesh
            key={`rail_${dx}_${dz}`}
            position={[shaftCenterX + dx, totalH / 2, centerZ + dz]}
          >
            <boxGeometry args={[0.1, totalH, 0.1]} />
            <meshStandardMaterial color={SCENE_PALETTE.elevatorFrame} roughness={0.6} />
          </mesh>
        )),
      )}
    </group>
  )
}

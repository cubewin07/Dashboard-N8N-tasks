import type { BuildingLayout } from '@/scene/layout'
import { toWorldX, toWorldZ } from './coords'
import { SCENE_PALETTE } from './palette'

export interface StairwellProps {
  layout: BuildingLayout
}

export function Stairwell({ layout }: StairwellProps) {
  const firstFloor = layout.floors[0]
  if (!firstFloor || layout.floors.length < 2) {
    return null
  }

  const { w, d, h: floorH } = firstFloor.size
  const entry = firstFloor.stairsEntrySlot
  const flightCount = layout.floors.length - 1
  const rampRunZ = 2.4
  const rampLen = Math.hypot(rampRunZ, floorH / 2)
  const rampPitch = Math.atan2(floorH / 2, rampRunZ)
  const baseX = toWorldX(entry.x + 0.6, w)
  const baseZ = toWorldZ(entry.z, d)

  return (
    <group name="stairwell">
      {Array.from({ length: flightCount }, (_, i) => {
        const y0 = i * floorH
        const yMid = y0 + floorH / 2
        return (
          <group key={`stair_flight_${i}`}>
            {/* Lower half flight */}
            <mesh
              position={[baseX - 0.45, y0 + floorH * 0.25, baseZ]}
              rotation={[rampPitch, 0, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.85, 0.14, rampLen]} />
              <meshStandardMaterial color={SCENE_PALETTE.stairsRamp} roughness={0.8} />
            </mesh>

            {/* Mid-floor landing */}
            <mesh
              position={[baseX, yMid, baseZ - rampRunZ / 2 - 0.45]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[1.8, 0.14, 0.9]} />
              <meshStandardMaterial color={SCENE_PALETTE.stairsRail} roughness={0.75} />
            </mesh>

            {/* Upper half flight */}
            <mesh
              position={[baseX + 0.45, y0 + floorH * 0.75, baseZ]}
              rotation={[-rampPitch, 0, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.85, 0.14, rampLen]} />
              <meshStandardMaterial color={SCENE_PALETTE.stairsRamp} roughness={0.8} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

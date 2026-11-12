import type { BuildingLayout, FloorLayout } from '@/scene/layout'
import type { CameraMode } from './viewStore'

export interface CameraPoseAndLimits {
  position: [number, number, number]
  target: [number, number, number]
  minAzimuthAngle: number
  maxAzimuthAngle: number
  minPolarAngle: number
  maxPolarAngle: number
  minDistance: number
  maxDistance: number
}

const DEG2RAD = Math.PI / 180

export function computeCameraPose(
  mode: CameraMode,
  layout: BuildingLayout,
  focusedFloorKey: string | null,
): CameraPoseAndLimits {
  const totalH = layout.totalHeight

  if (mode === 'floor' && focusedFloorKey) {
    const floor: FloorLayout | undefined = layout.floors.find(
      (f) => f.key === focusedFloorKey,
    )
    if (floor) {
      const targetY = floor.y + 1.1
      return {
        position: [2.2, floor.y + 13.5, 25.5],
        target: [0, targetY, 0],
        minAzimuthAngle: -45 * DEG2RAD,
        maxAzimuthAngle: 45 * DEG2RAD,
        minPolarAngle: 30 * DEG2RAD,
        maxPolarAngle: 84 * DEG2RAD,
        minDistance: 10,
        maxDistance: 54,
      }
    }
  }

  const fitDist = Math.max(60, totalH * 1.9)
  const centerY = totalH * 0.48
  const overviewPos: [number, number, number] = [
    fitDist * 0.18,
    centerY + fitDist * 0.12,
    fitDist * 0.97,
  ]
  const overviewTarget: [number, number, number] = [0, centerY, 0]

  if (mode === 'free') {
    return {
      position: overviewPos,
      target: overviewTarget,
      minAzimuthAngle: -Infinity,
      maxAzimuthAngle: Infinity,
      minPolarAngle: 5 * DEG2RAD,
      maxPolarAngle: 88 * DEG2RAD,
      minDistance: 2,
      maxDistance: Math.max(150, fitDist * 3),
    }
  }

  // overview mode
  return {
    position: overviewPos,
    target: overviewTarget,
    minAzimuthAngle: -70 * DEG2RAD,
    maxAzimuthAngle: 70 * DEG2RAD,
    minPolarAngle: 35 * DEG2RAD,
    maxPolarAngle: 88 * DEG2RAD,
    minDistance: fitDist * 0.4,
    maxDistance: fitDist * 2.0,
  }
}

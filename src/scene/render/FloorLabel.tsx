import { Text } from '@react-three/drei'
import type { FloorSummary } from '@/domain/selectors'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import type { FloorLayout } from '@/scene/layout'
import { toWorldX, toWorldZ } from './coords'
import { getSwatchColor, SCENE_PALETTE } from './palette'

export interface FloorLabelChip {
  id: string
  text: string
  swatchKey?: string
}

export interface FloorLabelProps {
  floor: FloorLayout
  opacity?: number
  chips?: readonly FloorLabelChip[]
}

const FONT_URL = `${import.meta.env.BASE_URL}assets/fonts/BeVietnamPro-SemiBold.ttf`

export function buildFloorChips(
  summary: FloorSummary,
  labels: { chipWorking: string; chipWaiting: string; chipReviewPile: string },
): FloorLabelChip[] {
  return [
    { id: 'working', text: fmt(labels.chipWorking, { n: summary.working }), swatchKey: 'working' },
    { id: 'waiting', text: fmt(labels.chipWaiting, { n: summary.waiting }), swatchKey: 'waiting' },
    { id: 'reviewPile', text: fmt(labels.chipReviewPile, { n: summary.reviewPile }), swatchKey: 'boss' },
  ]
}

export function formatFloorChipsText(chips: readonly FloorLabelChip[]): string {
  return chips.map((c) => c.text).join('  ·  ')
}

export function FloorLabel({ floor, opacity = 1, chips }: FloorLabelProps) {
  const { lang } = useI18n()
  const floorTitle =
    lang === 'vi'
      ? `Tầng ${floor.index + 1} · ${floor.label.vi}`
      : `F${floor.index + 1} · ${floor.label.en}`

  const swatchColor = getSwatchColor(floor.colorSwatch)
  const { w, d } = floor.size

  return (
    <group position={[toWorldX(1.2, w), 0.52, toWorldZ(-0.22, d)]}>
      <mesh position={[-0.45, 0, 0]} userData={{ ignoreFade: true }}>
        <boxGeometry args={[0.32, 0.32, 0.06]} />
        <meshStandardMaterial
          color={swatchColor}
          transparent={opacity < 0.99}
          opacity={opacity}
        />
      </mesh>
      <Text
        font={FONT_URL}
        fontSize={0.36}
        anchorX="left"
        anchorY="middle"
        color={SCENE_PALETTE.elevatorFrame}
        fillOpacity={opacity}
        outlineWidth={0.015}
        outlineColor="#ffffff"
        outlineOpacity={opacity * 0.85}
      >
        {floorTitle}
      </Text>
      {chips && chips.length > 0 ? (
        <Text
          position={[0, -0.42, 0]}
          font={FONT_URL}
          fontSize={0.22}
          anchorX="left"
          anchorY="middle"
          color={swatchColor}
          fillOpacity={opacity}
        >
          {formatFloorChipsText(chips)}
        </Text>
      ) : null}
    </group>
  )
}

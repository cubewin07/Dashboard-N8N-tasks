import { useMemo } from 'react'
import { Text } from '@react-three/drei'
import { useI18n } from '@/i18n'
import type { BuildingLayout } from '@/scene/layout'
import { FURNITURE_MAP } from './assets/furnitureMap'
import { isModelReady } from './assets/modelStore'
import { buildExteriorPlacements } from './assets/placements'
import { useAssetManifest, useModelsVersion } from './assets/useModels'
import { InstancedModels } from './InstancedModels'
import { SCENE_PALETTE } from './palette'

const FONT_URL = `${import.meta.env.BASE_URL}assets/fonts/BeVietnamPro-SemiBold.ttf`
const EMPTY: readonly never[] = []

export interface ExteriorProps {
  layout: BuildingLayout
  /** The roof sign steps aside while a floor is focused (the roof lifts off). */
  showSign?: boolean
}

/** Plaza, trees, lamps, benches, scooters and the roof sign (P06b R9). */
export function Exterior({ layout, showSign = true }: ExteriorProps) {
  const { t } = useI18n()
  const manifest = useAssetManifest()
  const version = useModelsVersion()

  const sign = FURNITURE_MAP.exterior?.sign
  const placements = useMemo(() => {
    if (!manifest) return EMPTY
    const all = buildExteriorPlacements(layout, FURNITURE_MAP, manifest)
    return showSign ? all : all.filter((p) => p.model !== sign?.model)
  }, [layout, manifest, showSign, sign])

  const signText = useMemo(() => {
    void version
    if (!sign || !manifest || !isModelReady(sign.model)) return null
    const anchor = manifest.files[sign.model]?.anchors.find((a) => a.kind === 'text')
    if (!anchor) return null
    // The sign is turned half a turn to face the street, so x and z flip.
    return [
      sign.x - anchor.pos[0],
      layout.totalHeight + sign.aboveRoof + anchor.pos[1],
      sign.z - anchor.pos[2] + 0.02,
    ] as const
  }, [sign, manifest, layout.totalHeight, version])

  return (
    <group name="exterior">
      <InstancedModels name="exterior-props" placements={placements} activeFloorIndex={null} />
      {signText && showSign ? (
        <Text
          position={[signText[0], signText[1], signText[2]]}
          font={FONT_URL}
          fontSize={0.42}
          anchorX="center"
          anchorY="middle"
          color={SCENE_PALETTE.elevatorFrame}
        >
          {t.common.app.name}
        </Text>
      ) : null}
    </group>
  )
}

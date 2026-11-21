import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getFeedClock } from '@/office/store'
import { useOfficePrefs } from '@/office/prefs'
import { visualLanguage } from '@/office/visualConfig'
import { dayLight, localMinutes, NOON, type DayLight } from './clock'
import { LIGHT_BASE, lightRig } from './Lights'
import { getSwatchColor, SCENE_PALETTE } from './palette'

/** Swatches the light leans towards at night and at dawn/dusk. */
const NIGHT_SWATCH = 'indigo_600'
const DARK_SWATCH = 'neutral_900'
const WARM_SWATCH = 'orange_500'
/** Share of full brightness left at deepest night. */
const NIGHT_FLOOR = { hemi: 0.45, sun: 0.25 } as const

const sky = new THREE.Color(SCENE_PALETTE.skyBg)
const tmp = new THREE.Color()

/** Light colours for a day/night factor (noon reproduces the base look). */
export function applyDayLight(
  light: DayLight,
  out: { background: THREE.Color | null; hemi: THREE.HemisphereLight | null; sun: THREE.DirectionalLight | null },
): void {
  const night = 1 - light.daylight
  const nightTint = getSwatchColor(NIGHT_SWATCH)
  const warm = getSwatchColor(WARM_SWATCH)
  if (out.background) {
    out.background
      .copy(sky)
      .lerp(warm, light.warmth * 0.25)
      .lerp(nightTint, night * 0.35)
      .lerp(getSwatchColor(DARK_SWATCH), night * 0.55)
  }
  if (out.hemi) {
    out.hemi.intensity = LIGHT_BASE.hemi * (NIGHT_FLOOR.hemi + (1 - NIGHT_FLOOR.hemi) * light.daylight)
    out.hemi.color.copy(SCENE_PALETTE.hemiSky).lerp(nightTint, night * 0.5)
  }
  if (out.sun) {
    out.sun.intensity = LIGHT_BASE.sun * (NIGHT_FLOOR.sun + (1 - NIGHT_FLOOR.sun) * light.daylight)
    tmp.copy(SCENE_PALETTE.sunLight).lerp(warm, light.warmth * 0.5).lerp(nightTint, night * 0.5)
    out.sun.color.copy(tmp)
  }
}

export interface DayNightProps {
  reducedMotion?: boolean
}

/**
 * P05-T12 (R11, D7): cosmetic lighting by sim hour. With the toggle off,
 * or under reduced motion (no transitions, R14), lighting stays at noon.
 */
export function DayNight({ reducedMotion = false }: DayNightProps) {
  const enabled = useOfficePrefs((s) => s.dayNight) && !reducedMotion
  const scene = useThree((s) => s.scene)
  const appliedNoon = useRef(false)

  useFrame(() => {
    const background = scene.background instanceof THREE.Color ? scene.background : null
    const target = { background, hemi: lightRig.hemi, sun: lightRig.sun }
    const feed = getFeedClock()
    if (!enabled || !feed) {
      if (!appliedNoon.current) {
        applyDayLight(NOON, target)
        appliedNoon.current = true
      }
      return
    }
    appliedNoon.current = false
    const { dawn, dusk } = visualLanguage.dayNight
    applyDayLight(dayLight(localMinutes(feed.nowMs), dawn, dusk), target)
  })

  return null
}

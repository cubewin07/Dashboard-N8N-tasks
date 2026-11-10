import * as THREE from 'three'
import { assetUrl } from './manifest'
import type { MaterialKind } from './modelStore'

/**
 * The three shared materials every P06a model uses (assets.md §1.2). One
 * instance each for the whole scene, so models batch and colours stay exact.
 */
let cache: Record<MaterialKind, THREE.Material> | null = null

export function getSharedMaterials(): Record<MaterialKind, THREE.Material> {
  if (cache) return cache
  const palette = new THREE.TextureLoader().load(assetUrl('textures/palette.png'))
  palette.colorSpace = THREE.SRGBColorSpace
  palette.magFilter = THREE.NearestFilter
  palette.minFilter = THREE.NearestFilter
  palette.generateMipmaps = false
  palette.flipY = false

  cache = {
    palette: new THREE.MeshStandardMaterial({ map: palette, roughness: 0.85, metalness: 0 }),
    emissive: new THREE.MeshStandardMaterial({
      map: palette,
      emissiveMap: palette,
      emissive: new THREE.Color(1, 1, 1),
      emissiveIntensity: 0.9,
      roughness: 0.6,
      metalness: 0,
    }),
    glass: new THREE.MeshStandardMaterial({
      map: palette,
      transparent: true,
      opacity: 0.28,
      roughness: 0.1,
      metalness: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  }
  return cache
}

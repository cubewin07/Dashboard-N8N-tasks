import * as THREE from 'three'
import { getFloorFadeTarget } from '@/scene/camera/viewStore'

export { getFloorFadeTarget }

export function stepFadeOpacity(
  current: number,
  target: number,
  deltaSeconds: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion || Math.abs(target - current) < 0.005) {
    return target
  }
  const speed = 8
  const t = Math.min(1, deltaSeconds * speed)
  return current + (target - current) * t
}

export function applyGroupFade(
  root: THREE.Object3D,
  opacity: number,
  castShadow: boolean,
): void {
  const isFaded = opacity < 0.99
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    if (obj.userData.ignoreFade) return

    if (obj.userData.baseCastShadow === undefined) {
      obj.userData.baseCastShadow = obj.castShadow
    }
    obj.castShadow = Boolean(obj.userData.baseCastShadow) && castShadow

    const applyMat = (mat: THREE.Material) => {
      if (mat.userData.baseOpacity === undefined) {
        mat.userData.baseOpacity = mat.opacity
        mat.userData.baseTransparent = mat.transparent
      }
      const baseOpacity = Number(mat.userData.baseOpacity ?? 1)
      const nextOpacity = baseOpacity * opacity
      mat.transparent = Boolean(mat.userData.baseTransparent) || isFaded
      mat.opacity = nextOpacity
      mat.depthWrite = !isFaded && !mat.userData.baseTransparent
      mat.needsUpdate = true
    }

    if (Array.isArray(obj.material)) {
      obj.material.forEach(applyMat)
    } else if (obj.material instanceof THREE.Material) {
      applyMat(obj.material)
    }
  })
}

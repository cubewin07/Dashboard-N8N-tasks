import * as THREE from 'three'
import { SCENE_PALETTE } from './palette'

export interface ProceduralEnvironmentResult {
  texture: THREE.Texture
  dispose: () => void
}

/**
 * Creates a procedural environment map from a tiny gradient sky room using PMREMGenerator.
 * Disposes generator, geometry and material upon completion.
 * On failure, returns null so the caller retains hemisphere lighting only.
 */
export function createProceduralEnvironment(
  gl: THREE.WebGLRenderer | null,
): ProceduralEnvironmentResult | null {
  if (!gl || typeof gl.getContext !== 'function') {
    return null
  }

  const miniScene = new THREE.Scene()
  const radius = 10
  const geometry = new THREE.SphereGeometry(radius, 16, 12)

  const colorBottom = SCENE_PALETTE.hemiGround
  const colorHorizon = new THREE.Color(SCENE_PALETTE.skyBg)
  const colorZenith = SCENE_PALETTE.hemiSky

  const colors: number[] = []
  const pos = geometry.attributes.position
  if (!pos) {
    geometry.dispose()
    return null
  }

  const tmpColor = new THREE.Color()
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i)
    // Normalized height from 0 (bottom) to 1 (top)
    const t = Math.max(0, Math.min(1, (y + radius) / (2 * radius)))
    if (t < 0.5) {
      tmpColor.copy(colorBottom).lerp(colorHorizon, t * 2)
    } else {
      tmpColor.copy(colorHorizon).lerp(colorZenith, (t - 0.5) * 2)
    }
    colors.push(tmpColor.r, tmpColor.g, tmpColor.b)
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const material = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    vertexColors: true,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  miniScene.add(mesh)

  let renderTarget: THREE.WebGLRenderTarget | null = null
  let pmremGenerator: THREE.PMREMGenerator | null = null

  try {
    pmremGenerator = new THREE.PMREMGenerator(gl)
    renderTarget = pmremGenerator.fromScene(miniScene, 0.04)
  } catch (err) {
    console.warn(
      'Procedural PMREM environment generation failed, keeping hemisphere only:',
      err,
    )
  } finally {
    if (pmremGenerator) {
      pmremGenerator.dispose()
    }
    geometry.dispose()
    material.dispose()
  }

  if (!renderTarget) return null
  const target = renderTarget
  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  }
}

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import bodyMetaJson from '../../../public/assets/models/characters/body.meta.json'
import palette3d from '@/content/palette3d.json'
import { assetUrl } from '@/scene/render/assets/manifest'
import { paletteCell } from '@/scene/render/assets/paletteCells'
import {
  applyFaceCells,
  createFaceRegions,
  type FaceAtlasConfig,
  type FaceRegions,
} from './faceAnim'

export const SHAPE_KEYS = [
  'Heavy',
  'Slim',
  'Muscle',
  'Chest',
  'Hips',
  'Shoulders',
] as const

export type ShapeKey = (typeof SHAPE_KEYS)[number]
export type MorphWeights = Partial<Record<ShapeKey, number>> | readonly number[]
export type BaseBodyKey = 'female' | 'male'
export type TintChannel = 'primary' | 'secondary' | 'accent'
export type TintSwatches = Partial<Record<TintChannel, string>>

const PALETTE_GRID = palette3d.cell || 16
const SWATCH_HEX = new Map<string, string>(
  palette3d.swatches.map((s) => [s.key, s.hex]),
)

const DEFAULT_BODY_REGIONS: readonly string[] = bodyMetaJson.regions
const STATIC_BOUNDS_CENTER = new THREE.Vector3(0, 0.9, 0)
const STATIC_BOUNDS_RADIUS = 1.2

/** Resolve a palette swatch key (e.g. `'c_red'`) or raw `#RRGGBB` hex string. */
export function resolveSwatchHex(keyOrHex: string | undefined): string | null {
  if (!keyOrHex) return null
  const mapped = SWATCH_HEX.get(keyOrHex)
  if (mapped) return mapped
  if (keyOrHex.startsWith('#')) return keyOrHex
  return null
}

function makeFallbackTexture(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat)
  tex.needsUpdate = true
  return tex
}

function loadTextureSafe(
  relPath: string,
  configure: (tex: THREE.Texture) => void,
): THREE.Texture {
  if (typeof document === 'undefined') {
    const fallback = makeFallbackTexture()
    configure(fallback)
    return fallback
  }
  try {
    const tex = new THREE.TextureLoader().load(assetUrl(relPath))
    configure(tex)
    return tex
  } catch {
    const fallback = makeFallbackTexture()
    configure(fallback)
    return fallback
  }
}

let sharedCharacterMaterial: THREE.MeshStandardMaterial | null = null

/**
 * Lazy singleton material shared across ALL assembled characters (R1, R5).
 * Patches `MeshStandardMaterial` once to route `aFaceSlot > 0.5` fragments to
 * `face_atlas.png` (alpha-tested opaque pass) and apply per-character `aFade`
 * screen-door dithering + `aSat` desaturation.
 */
export function getSharedCharacterMaterial(): THREE.MeshStandardMaterial {
  if (sharedCharacterMaterial) return sharedCharacterMaterial

  const paletteTex = loadTextureSafe('textures/palette.png', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    tex.flipY = false
  })

  const faceAtlasTex = loadTextureSafe('textures/face_atlas.png', (tex) => {
    tex.colorSpace = THREE.NoColorSpace
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    tex.flipY = false
  })

  const mat = new THREE.MeshStandardMaterial({
    map: paletteTex,
    vertexColors: true,
    roughness: 0.78,
    metalness: 0,
  })

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFaceAtlas = { value: faceAtlasTex }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'attribute float aFaceSlot;',
          'attribute float aFade;',
          'attribute float aSat;',
          'varying float vFaceSlot;',
          'varying float vFade;',
          'varying float vSat;',
        ].join('\n'),
      )
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          'vFaceSlot = aFaceSlot;',
          'vFade = aFade;',
          'vSat = aSat;',
        ].join('\n'),
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform sampler2D uFaceAtlas;',
          'varying float vFaceSlot;',
          'varying float vFade;',
          'varying float vSat;',
          'float charFadeBayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }',
          'float charFadeBayer4(vec2 a) { return charFadeBayer2(0.5 * a) * 0.25 + charFadeBayer2(a); }',
        ].join('\n'),
      )
      .replace(
        '#include <clipping_planes_fragment>',
        [
          '#include <clipping_planes_fragment>',
          'if (vFade < 0.995 && vFade <= charFadeBayer4(gl_FragCoord.xy)) discard;',
        ].join('\n'),
      )
      .replace(
        '#include <map_fragment>',
        [
          '#ifdef USE_MAP',
          '  if (vFaceSlot <= 0.5) {',
          '    vec4 sampledDiffuseColor = texture2D( map, vMapUv );',
          '    #ifdef DECODE_VIDEO_TEXTURE',
          '      sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );',
          '    #endif',
          '    diffuseColor *= sampledDiffuseColor;',
          '  }',
          '#endif',
        ].join('\n'),
      )
      .replace(
        '#include <color_fragment>',
        [
          '#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )',
          '  if (vFaceSlot > 0.5) {',
          '    vec4 faceSample = texture2D( uFaceAtlas, vMapUv );',
          '    if (faceSample.a < 0.15) discard;',
          '    diffuseColor.rgb = mix( vColor.rgb, vec3( 1.0 ), faceSample.r );',
          '  } else {',
          '    diffuseColor *= vColor;',
          '  }',
          '#endif',
          'float charSatLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));',
          'diffuseColor.rgb = mix(vec3(charSatLuma), diffuseColor.rgb, vSat);',
        ].join('\n'),
      )
  }

  mat.customProgramCacheKey = () => 'character-palette-face-v1'
  mat.userData.faceAtlasTexture = faceAtlasTex
  mat.userData.paletteTexture = paletteTex
  sharedCharacterMaterial = mat
  return mat
}

function getWeightForMorphIndex(
  index: number,
  morphWeights: MorphWeights,
  morphDictionary?: Record<string, number>,
  attrName?: string,
): number {
  if (Array.isArray(morphWeights)) {
    const arr = morphWeights as readonly number[]
    return arr[index] ?? 0
  }
  const map = morphWeights as Partial<Record<ShapeKey, number>>
  if (morphDictionary) {
    for (const [name, dictIdx] of Object.entries(morphDictionary)) {
      if (dictIdx === index && name in map) {
        return map[name as ShapeKey] ?? 0
      }
    }
  }
  if (attrName && attrName in map) {
    return map[attrName as ShapeKey] ?? 0
  }
  const fallbackKey = SHAPE_KEYS[index]
  return fallbackKey ? (map[fallbackKey] ?? 0) : 0
}

/**
 * Bake morph targets into `position` and normalized `normal` on the CPU,
 * and delete all `morphAttributes` from the cloned geometry (R2).
 */
export function bakeMorphGeometry(
  source: THREE.BufferGeometry,
  morphWeights: MorphWeights,
  morphDictionary?: Record<string, number>,
): THREE.BufferGeometry {
  const out = source.clone()
  const posAttr = out.getAttribute('position')
  const count = posAttr.count
  const bakedPos = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    bakedPos[i * 3] = posAttr.getX(i)
    bakedPos[i * 3 + 1] = posAttr.getY(i)
    bakedPos[i * 3 + 2] = posAttr.getZ(i)
  }

  const normAttr = out.getAttribute('normal')
  const bakedNorm = new Float32Array(count * 3)
  if (normAttr) {
    for (let i = 0; i < count; i += 1) {
      bakedNorm[i * 3] = normAttr.getX(i)
      bakedNorm[i * 3 + 1] = normAttr.getY(i)
      bakedNorm[i * 3 + 2] = normAttr.getZ(i)
    }
  }

  const relative = out.morphTargetsRelative === true
  const posTargets = out.morphAttributes.position as THREE.BufferAttribute[] | undefined
  const normTargets = out.morphAttributes.normal as THREE.BufferAttribute[] | undefined

  if (posTargets && posTargets.length > 0) {
    for (let m = 0; m < posTargets.length; m += 1) {
      const target = posTargets[m]!
      const w = getWeightForMorphIndex(m, morphWeights, morphDictionary, target.name)
      if (Math.abs(w) < 1e-7) continue
      const nTarget = normTargets?.[m]
      for (let i = 0; i < count; i += 1) {
        const i3 = i * 3
        const dx = relative ? target.getX(i) : target.getX(i) - posAttr.getX(i)
        const dy = relative ? target.getY(i) : target.getY(i) - posAttr.getY(i)
        const dz = relative ? target.getZ(i) : target.getZ(i) - posAttr.getZ(i)
        bakedPos[i3] += w * dx
        bakedPos[i3 + 1] += w * dy
        bakedPos[i3 + 2] += w * dz
        if (nTarget && normAttr) {
          const ndx = relative ? nTarget.getX(i) : nTarget.getX(i) - normAttr.getX(i)
          const ndy = relative ? nTarget.getY(i) : nTarget.getY(i) - normAttr.getY(i)
          const ndz = relative ? nTarget.getZ(i) : nTarget.getZ(i) - normAttr.getZ(i)
          bakedNorm[i3] += w * ndx
          bakedNorm[i3 + 1] += w * ndy
          bakedNorm[i3 + 2] += w * ndz
        }
      }
    }
  }

  out.setAttribute('position', new THREE.Float32BufferAttribute(bakedPos, 3))

  if (normAttr) {
    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3
      const nx = bakedNorm[i3]!
      const ny = bakedNorm[i3 + 1]!
      const nz = bakedNorm[i3 + 2]!
      const len = Math.hypot(nx, ny, nz)
      if (len > 1e-6) {
        const inv = 1 / len
        bakedNorm[i3] = nx * inv
        bakedNorm[i3 + 1] = ny * inv
        bakedNorm[i3 + 2] = nz * inv
      }
    }
    out.setAttribute('normal', new THREE.Float32BufferAttribute(bakedNorm, 3))
  } else {
    out.computeVertexNormals()
  }

  out.morphAttributes = {}
  out.morphTargetsRelative = false
  return out
}

function isTriInRanges(triIdx: number, ranges: readonly (readonly number[])[]): boolean {
  for (let i = 0; i < ranges.length; i += 1) {
    const rng = ranges[i]!
    const start = rng[0] ?? 0
    const end = rng[1] ?? 0
    if (triIdx >= start && triIdx < end) return true
  }
  return false
}

/**
 * Remove body triangles where all 3 vertices belong to `hideRegionIds`
 * (encoded in `COLOR_0.r * 255`) or where the triangle index falls in `hideRanges`.
 */
export function filterHiddenBodyTriangles(
  source: THREE.BufferGeometry,
  hideRegionIds: Iterable<number>,
  hideRanges: readonly (readonly number[])[] = [],
): THREE.BufferGeometry {
  const out = source.clone()
  out.clearGroups()
  const hiddenSet = hideRegionIds instanceof Set ? hideRegionIds : new Set(hideRegionIds)

  const indexAttr = out.getIndex()
  const posAttr = out.getAttribute('position')
  const colorAttr = out.getAttribute('color')
  const triCount = indexAttr
    ? Math.floor(indexAttr.count / 3)
    : Math.floor(posAttr.count / 3)

  if (hiddenSet.size === 0 && hideRanges.length === 0) {
    if (!indexAttr) {
      const seq = Array.from({ length: triCount * 3 }, (_, i) => i)
      out.setIndex(seq)
    }
    return out
  }

  const kept: number[] = []
  for (let t = 0; t < triCount; t += 1) {
    if (hideRanges.length > 0 && isTriInRanges(t, hideRanges)) continue

    const a = indexAttr ? indexAttr.getX(t * 3) : t * 3
    const b = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1
    const c = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2

    if (colorAttr && hiddenSet.size > 0) {
      const ra = Math.round(colorAttr.getX(a) * 255)
      const rb = Math.round(colorAttr.getX(b) * 255)
      const rc = Math.round(colorAttr.getX(c) * 255)
      if (hiddenSet.has(ra) && hiddenSet.has(rb) && hiddenSet.has(rc)) continue
    }

    kept.push(a, b, c)
  }

  out.setIndex(kept)
  return out
}

export interface UvBufferLike {
  readonly count: number
  getX(i: number): number
  getY(i: number): number
  setXY(i: number, x: number, y: number): unknown
  needsUpdate?: boolean
}

/**
 * Remap palette UVs from `fromKey` cell(s) to `toKey` cell(s) in a single pass
 * so chained mappings cannot double-shift. Also accepts single-key shorthand.
 */
export function remapCellUvsInPlace(
  uv: UvBufferLike,
  mapping: ReadonlyArray<readonly [string, string]> | string,
  toKey?: string,
): number {
  const pairs: ReadonlyArray<readonly [string, string]> =
    typeof mapping === 'string'
      ? toKey
        ? [[mapping, toKey]]
        : []
      : mapping

  const rules: Array<{
    fromCol: number
    fromRow: number
    du: number
    dv: number
  }> = []

  for (const [from, to] of pairs) {
    if (from === to) continue
    const a = paletteCell(from)
    const b = paletteCell(to)
    if (!a || !b) continue
    rules.push({
      fromCol: a.col,
      fromRow: a.row,
      du: (b.col - a.col) / PALETTE_GRID,
      dv: (b.row - a.row) / PALETTE_GRID,
    })
  }

  if (rules.length === 0) return 0

  let moved = 0
  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    const col = Math.min(PALETTE_GRID - 1, Math.max(0, Math.floor(u * PALETTE_GRID)))
    const row = Math.min(PALETTE_GRID - 1, Math.max(0, Math.floor(v * PALETTE_GRID)))
    for (let r = 0; r < rules.length; r += 1) {
      const rule = rules[r]!
      if (col === rule.fromCol && row === rule.fromRow) {
        uv.setXY(i, u + rule.du, v + rule.dv)
        moved += 1
        break
      }
    }
  }
  if (moved > 0) uv.needsUpdate = true
  return moved
}

export interface BakeTintOptions {
  /** Move tinted vertices' UVs onto the `white` palette cell so `palette * tint == tint`. Default `true`. */
  moveTintedUvToWhite?: boolean
}

/**
 * Convert `COLOR_0` tint mask `(primary, secondary, accent, shade)` into linear RGB
 * vertex colors multiplied by `shade`. Tinted vertices are also moved to the `white`
 * palette cell so palette multiplication preserves exact swatch colors.
 */
export function bakeTintColors(
  geometry: THREE.BufferGeometry,
  swatches: TintSwatches,
  opts: BakeTintOptions = {},
): THREE.BufferGeometry {
  const moveUv = opts.moveTintedUvToWhite !== false
  const posAttr = geometry.getAttribute('position')
  const count = posAttr.count
  const srcColor = geometry.getAttribute('color')
  const uvAttr = ensureFloatUvAttribute(geometry)

  const resolveColor = (key: string | undefined): THREE.Color | null => {
    const hex = resolveSwatchHex(key)
    return hex ? new THREE.Color(hex) : null
  }

  const cPrimary = resolveColor(swatches.primary)
  const cSecondary = resolveColor(swatches.secondary)
  const cAccent = resolveColor(swatches.accent)

  const whiteCell = paletteCell('white') ?? { col: 11, row: 1 }
  const whiteU = (whiteCell.col + 0.5) / PALETTE_GRID
  const whiteV = (whiteCell.row + 0.5) / PALETTE_GRID

  const outColors = new Float32Array(count * 3)
  let movedUvs = false

  for (let i = 0; i < count; i += 1) {
    const r = srcColor ? srcColor.getX(i) : 0
    const g = srcColor ? srcColor.getY(i) : 0
    const b = srcColor ? srcColor.getZ(i) : 0
    const shade = srcColor && srcColor.itemSize >= 4 ? srcColor.getW(i) : 1.0

    let tint: THREE.Color | null = null
    if (r > 0.5 && cPrimary) tint = cPrimary
    else if (g > 0.5 && cSecondary) tint = cSecondary
    else if (b > 0.5 && cAccent) tint = cAccent

    const i3 = i * 3
    if (tint) {
      outColors[i3] = tint.r * shade
      outColors[i3 + 1] = tint.g * shade
      outColors[i3 + 2] = tint.b * shade
      if (moveUv && uvAttr) {
        uvAttr.setXY(i, whiteU, whiteV)
        movedUvs = true
      }
    } else {
      outColors[i3] = shade
      outColors[i3 + 1] = shade
      outColors[i3 + 2] = shade
    }
  }

  if (movedUvs && uvAttr) uvAttr.needsUpdate = true
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(outColors, 3))
  return geometry
}

export interface MergeRigidPartOptions {
  scale?: number
  offset?: readonly number[]
}

/**
 * Transform a rest-pose rigid accessory (`scale` + `offset`) and assign single-bone
 * skinning (`[boneIndex, 0, 0, 0]`, `[1, 0, 0, 0]`) so it merges into one `SkinnedMesh`.
 */
export function mergeRigidPart(
  source: THREE.BufferGeometry,
  boneIndex: number,
  opts: MergeRigidPartOptions = {},
): THREE.BufferGeometry {
  const out = source.clone()
  const s = opts.scale ?? 1
  if (s !== 1) {
    out.scale(s, s, s)
  }
  const offset = opts.offset
  const ox = offset?.[0] ?? 0
  const oy = offset?.[1] ?? 0
  const oz = offset?.[2] ?? 0
  if (ox !== 0 || oy !== 0 || oz !== 0) {
    out.translate(ox, oy, oz)
  }

  const count = out.getAttribute('position').count
  const skinIndex = new Uint16Array(count * 4)
  const skinWeight = new Float32Array(count * 4)
  for (let i = 0; i < count; i += 1) {
    const i4 = i * 4
    skinIndex[i4] = boneIndex
    skinWeight[i4] = 1
  }
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4))
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4))
  return out
}

function ensureFloatUvAttribute(geometry: THREE.BufferGeometry): THREE.BufferAttribute | null {
  const uv = geometry.getAttribute('uv')
  if (!uv) return null
  if (uv instanceof THREE.BufferAttribute && uv.array instanceof Float32Array) {
    return uv
  }
  const arr = new Float32Array(uv.count * 2)
  for (let i = 0; i < uv.count; i += 1) {
    arr[i * 2] = uv.getX(i)
    arr[i * 2 + 1] = uv.getY(i)
  }
  const floatAttr = new THREE.Float32BufferAttribute(arr, 2)
  geometry.setAttribute('uv', floatAttr)
  return floatAttr
}

/**
 * Normalize all attributes across parts so `mergeGeometries` always succeeds
 * cleanly even when source GLBs use quantized Int8 normals or Uint16 UVs.
 */
function normalizeForMerge(
  geometry: THREE.BufferGeometry,
  faceSlotValue: number,
): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position')
  const count = pos.count

  if (!(pos instanceof THREE.BufferAttribute) || !(pos.array instanceof Float32Array)) {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      arr[i * 3] = pos.getX(i)
      arr[i * 3 + 1] = pos.getY(i)
      arr[i * 3 + 2] = pos.getZ(i)
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
  }

  const norm = geometry.getAttribute('normal')
  if (!norm) {
    geometry.computeVertexNormals()
  } else if (!(norm instanceof THREE.BufferAttribute) || !(norm.array instanceof Float32Array)) {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      arr[i * 3] = norm.getX(i)
      arr[i * 3 + 1] = norm.getY(i)
      arr[i * 3 + 2] = norm.getZ(i)
    }
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(arr, 3))
  }

  if (!geometry.getAttribute('uv')) {
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2))
  } else {
    ensureFloatUvAttribute(geometry)
  }

  const color = geometry.getAttribute('color')
  if (
    !color ||
    color.itemSize !== 3 ||
    !(color instanceof THREE.BufferAttribute) ||
    !(color.array instanceof Float32Array)
  ) {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      arr[i * 3] = color ? color.getX(i) : 1
      arr[i * 3 + 1] = color ? color.getY(i) : 1
      arr[i * 3 + 2] = color ? color.getZ(i) : 1
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3))
  }

  const skinIdx = geometry.getAttribute('skinIndex')
  if (
    !skinIdx ||
    !(skinIdx instanceof THREE.BufferAttribute) ||
    !(skinIdx.array instanceof Uint16Array)
  ) {
    const arr = new Uint16Array(count * 4)
    if (skinIdx) {
      for (let i = 0; i < count; i += 1) {
        arr[i * 4] = skinIdx.getX(i)
        arr[i * 4 + 1] = skinIdx.getY(i)
        arr[i * 4 + 2] = skinIdx.getZ(i)
        arr[i * 4 + 3] = skinIdx.getW(i)
      }
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(arr, 4))
  }

  const skinWt = geometry.getAttribute('skinWeight')
  if (
    !skinWt ||
    !(skinWt instanceof THREE.BufferAttribute) ||
    !(skinWt.array instanceof Float32Array)
  ) {
    const arr = new Float32Array(count * 4)
    if (skinWt) {
      for (let i = 0; i < count; i += 1) {
        arr[i * 4] = skinWt.getX(i)
        arr[i * 4 + 1] = skinWt.getY(i)
        arr[i * 4 + 2] = skinWt.getZ(i)
        arr[i * 4 + 3] = skinWt.getW(i)
      }
    } else {
      for (let i = 0; i < count; i += 1) arr[i * 4] = 1
    }
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(arr, 4))
  }

  const faceSlot = new Float32Array(count)
  if (faceSlotValue !== 0) faceSlot.fill(faceSlotValue)
  geometry.setAttribute('aFaceSlot', new THREE.Float32BufferAttribute(faceSlot, 1))

  if (!geometry.getIndex()) {
    const idx = Array.from({ length: count }, (_, i) => i)
    geometry.setIndex(idx)
  }

  for (const attrName of Object.keys(geometry.attributes)) {
    if (
      attrName !== 'position' &&
      attrName !== 'normal' &&
      attrName !== 'uv' &&
      attrName !== 'color' &&
      attrName !== 'skinIndex' &&
      attrName !== 'skinWeight' &&
      attrName !== 'aFaceSlot'
    ) {
      geometry.deleteAttribute(attrName)
    }
  }
  geometry.morphAttributes = {}
  geometry.morphTargetsRelative = false
  geometry.clearGroups()
  return geometry
}

function defaultBoneForSlot(slot: string): string {
  switch (slot) {
    case 'neck':
      return 'Neck'
    case 'wrist':
      return 'Attach_WristL'
    case 'bag':
      return 'Attach_Back'
    case 'hair':
    case 'glasses':
    case 'head':
    case 'ears':
    default:
      return 'Head'
  }
}

function cloneSkeletonHierarchy(source: THREE.Skeleton): {
  skeleton: THREE.Skeleton
  rootBones: THREE.Bone[]
} {
  const sourceSet = new Set(source.bones)
  const clonedBones = source.bones.map((src) => {
    const b = new THREE.Bone()
    b.name = src.name
    b.position.copy(src.position)
    b.quaternion.copy(src.quaternion)
    b.scale.copy(src.scale)
    b.matrixAutoUpdate = src.matrixAutoUpdate
    return b
  })

  const boneMap = new Map<THREE.Bone, THREE.Bone>()
  for (let i = 0; i < source.bones.length; i += 1) {
    boneMap.set(source.bones[i]!, clonedBones[i]!)
  }

  const rootBones: THREE.Bone[] = []
  for (let i = 0; i < source.bones.length; i += 1) {
    const src = source.bones[i]!
    const dst = clonedBones[i]!
    const parentClone = src.parent instanceof THREE.Bone ? boneMap.get(src.parent) : undefined
    if (parentClone && sourceSet.has(src.parent as THREE.Bone)) {
      parentClone.add(dst)
    } else {
      rootBones.push(dst)
    }
  }

  const inverses = source.boneInverses.map((m) => m.clone())
  const skeleton = new THREE.Skeleton(clonedBones, inverses)
  return { skeleton, rootBones }
}

function findMaterialName(mesh: THREE.Mesh): string {
  const mat = mesh.material
  if (Array.isArray(mat)) return mat[0]?.name ?? ''
  return mat?.name ?? ''
}

interface ExtractedBody {
  bodyGeometry: THREE.BufferGeometry
  faceGeometry: THREE.BufferGeometry | null
  bodyMorphDictionary?: Record<string, number>
  faceMorphDictionary?: Record<string, number>
  skeleton: THREE.Skeleton
}

export interface BodyInputObject {
  scene?: THREE.Object3D
  root?: THREE.Object3D
  bodyMesh?: THREE.SkinnedMesh
  faceMesh?: THREE.SkinnedMesh | null
  bodyGeometry?: THREE.BufferGeometry
  faceGeometry?: THREE.BufferGeometry | null
  skeleton?: THREE.Skeleton
  morphTargetDictionary?: Record<string, number>
}

function extractBody(input: THREE.Object3D | BodyInputObject): ExtractedBody {
  if (input instanceof THREE.Object3D) {
    return extractBody({ scene: input })
  }
  if (input.bodyGeometry && input.skeleton) {
    return {
      bodyGeometry: input.bodyGeometry,
      faceGeometry: input.faceGeometry ?? null,
      bodyMorphDictionary: input.morphTargetDictionary,
      faceMorphDictionary: input.morphTargetDictionary,
      skeleton: input.skeleton,
    }
  }
  if (input.bodyMesh) {
    const skel = input.skeleton ?? input.bodyMesh.skeleton
    return {
      bodyGeometry: input.bodyMesh.geometry,
      faceGeometry: input.faceMesh?.geometry ?? null,
      bodyMorphDictionary: input.bodyMesh.morphTargetDictionary,
      faceMorphDictionary: input.faceMesh?.morphTargetDictionary,
      skeleton: skel,
    }
  }

  const root = input.scene ?? input.root
  if (!root) {
    throw new Error('assembleCharacter: body input must provide a scene, bodyMesh, or bodyGeometry')
  }

  const meshes: THREE.Mesh[] = []
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj)
  })

  let bodyMesh: THREE.Mesh | null = null
  let faceMesh: THREE.Mesh | null = null
  let skeleton: THREE.Skeleton | null = input.skeleton ?? null

  for (const m of meshes) {
    if (m instanceof THREE.SkinnedMesh && !skeleton) {
      skeleton = m.skeleton
    }
    const matName = findMaterialName(m)
    if (matName === 'M_Face' || m.name.endsWith('_mesh_2') || m.name.includes('face')) {
      faceMesh = m
    } else if (!bodyMesh) {
      bodyMesh = m
    }
  }

  if (!bodyMesh) {
    throw new Error('assembleCharacter: no body mesh found in body GLB')
  }
  if (!skeleton) {
    throw new Error('assembleCharacter: no skeleton found on body mesh')
  }

  return {
    bodyGeometry: bodyMesh.geometry,
    faceGeometry: faceMesh?.geometry ?? null,
    bodyMorphDictionary: bodyMesh.morphTargetDictionary,
    faceMorphDictionary: faceMesh?.morphTargetDictionary,
    skeleton,
  }
}

function extractPartMesh(asset: THREE.Object3D | THREE.BufferGeometry): {
  geometry: THREE.BufferGeometry
  isSkinned: boolean
  morphTargetDictionary?: Record<string, number>
} {
  if (asset instanceof THREE.BufferGeometry) {
    return {
      geometry: asset,
      isSkinned: Boolean(asset.getAttribute('skinIndex')),
    }
  }
  let found: THREE.Mesh | null = null
  asset.traverse((obj) => {
    if (!found && obj instanceof THREE.Mesh) found = obj
  })
  if (!found) {
    throw new Error('assembleCharacter: wardrobe asset contains no mesh')
  }
  const mesh = found as THREE.Mesh
  return {
    geometry: mesh.geometry,
    isSkinned: mesh instanceof THREE.SkinnedMesh || Boolean(mesh.geometry.getAttribute('skinIndex')),
    morphTargetDictionary: mesh.morphTargetDictionary,
  }
}

export interface WardrobePartBaseMeta {
  hideRegions?: readonly string[]
  hideRanges?: readonly (readonly number[])[]
  offset?: readonly number[]
  scale?: number
}

export interface WardrobePartMeta {
  kind?: 'skinned' | 'rigid'
  bone?: string
  merge?: boolean
  bases?: Partial<Record<BaseBodyKey, WardrobePartBaseMeta>>
  hideRegions?: readonly string[]
  hideRanges?: readonly (readonly number[])[]
  offset?: readonly number[]
  scale?: number
}

export interface WardrobePartInput {
  id: string
  slot: string
  asset: THREE.Object3D | THREE.BufferGeometry
  meta?: WardrobePartMeta
  defaultColors?: TintSwatches
  hides?: readonly string[]
}

export interface CharacterAppearanceInput {
  base: BaseBodyKey
  body?: Partial<Record<'height' | 'build' | 'muscle' | 'chest' | 'hips' | 'shoulders', number>>
  skin: string
  face: {
    eyes: string
    brows: string
    mouth: string
    eyeColor: string
    blush?: boolean
  }
  hair: {
    item: string | null
    color: string
  }
  colors?: Record<string, TintSwatches | undefined>
}

export interface AssembleCharacterInput {
  appearance: CharacterAppearanceInput
  body: THREE.Object3D | BodyInputObject
  parts?: readonly WardrobePartInput[]
  /** Precomputed morph weights from `bodyMap.ts`; falls back to `appearance.body` if omitted. */
  morphWeights?: MorphWeights
  /** Precomputed height scale from `bodyMap.ts`; falls back to `appearance.body.height` if omitted. */
  heightScale?: number
  bodyRegions?: readonly string[]
  faceAtlas?: FaceAtlasConfig
}

export interface AssembledCharacter {
  mesh: THREE.SkinnedMesh
  extraMeshes: THREE.Mesh[]
  skeleton: THREE.Skeleton
  attach: {
    handR: THREE.Bone | null
    handL: THREE.Bone | null
    head: THREE.Bone | null
  }
  faceRegions: FaceRegions | null
  heightScale: number
  morphSummary: Record<ShapeKey, number>
  dispose(): void
}

function resolveDefaultMorphSummary(
  morphWeights: MorphWeights | undefined,
  bodySliders: CharacterAppearanceInput['body'] | undefined,
): Record<ShapeKey, number> {
  if (morphWeights && !Array.isArray(morphWeights)) {
    const rec = morphWeights as Partial<Record<ShapeKey, number>>
    return {
      Heavy: rec.Heavy ?? 0,
      Slim: rec.Slim ?? 0,
      Muscle: rec.Muscle ?? 0,
      Chest: rec.Chest ?? 0,
      Hips: rec.Hips ?? 0,
      Shoulders: rec.Shoulders ?? 0,
    }
  }
  if (Array.isArray(morphWeights)) {
    return {
      Heavy: morphWeights[0] ?? 0,
      Slim: morphWeights[1] ?? 0,
      Muscle: morphWeights[2] ?? 0,
      Chest: morphWeights[3] ?? 0,
      Hips: morphWeights[4] ?? 0,
      Shoulders: morphWeights[5] ?? 0,
    }
  }
  const build = bodySliders?.build ?? 0.5
  return {
    Heavy: build > 0.5 ? Math.min(0.8, (build - 0.5) * 1.6) : 0,
    Slim: build < 0.5 ? Math.min(0.6, (0.5 - build) * 1.2) : 0,
    Muscle: (bodySliders?.muscle ?? 0) * 0.8,
    Chest: bodySliders?.chest ?? 0,
    Hips: bodySliders?.hips ?? 0,
    Shoulders: bodySliders?.shoulders ?? 0,
  }
}

function buildSkinUvPairs(skinKey: string, blush: boolean): ReadonlyArray<readonly [string, string]> {
  return [
    ['skin_01', skinKey],
    ['skin_01_shadow', `${skinKey}_shadow`],
    ['skin_01_lip', `${skinKey}_lip`],
    ['skin_01_blush', blush ? `${skinKey}_blush` : skinKey],
  ]
}

function buildHairUvPairs(hairColor: string): ReadonlyArray<readonly [string, string]> {
  const hiKey = SWATCH_HEX.has(`${hairColor}_hi`) ? `${hairColor}_hi` : hairColor
  return [
    ['hair_black', hairColor],
    ['hair_black_hi', hiKey],
  ]
}

function attachPerObjectFadeSatSync(mesh: THREE.Mesh): void {
  mesh.userData.fade = 1
  mesh.userData.sat = 1
  mesh.userData._lastFade = 1
  mesh.userData._lastSat = 1

  mesh.onBeforeRender = () => {
    const fade = typeof mesh.userData.fade === 'number' ? mesh.userData.fade : 1
    const sat = typeof mesh.userData.sat === 'number' ? mesh.userData.sat : 1

    if (fade !== mesh.userData._lastFade) {
      const attr = mesh.geometry.getAttribute('aFade')
      if (attr instanceof THREE.BufferAttribute && attr.array instanceof Float32Array) {
        attr.array.fill(fade)
        attr.needsUpdate = true
      }
      mesh.userData._lastFade = fade
    }
    if (sat !== mesh.userData._lastSat) {
      const attr = mesh.geometry.getAttribute('aSat')
      if (attr instanceof THREE.BufferAttribute && attr.array instanceof Float32Array) {
        attr.array.fill(sat)
        attr.needsUpdate = true
      }
      mesh.userData._lastSat = sat
    }
  }
}

function fillWhiteVertexColor(geometry: THREE.BufferGeometry): void {
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  colors.fill(1)
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
}

function bakeFaceVertexColors(
  faceColorAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  eyeHex: string,
  browHex: string,
  lipHex: string,
): Float32Array {
  const count = faceColorAttr.count
  const eyeCol = new THREE.Color(eyeHex)
  const browCol = new THREE.Color(browHex)
  const lipCol = new THREE.Color(lipHex)
  const out = new Float32Array(count * 3)

  for (let i = 0; i < count; i += 1) {
    const r = faceColorAttr.getX(i)
    const g = faceColorAttr.getY(i)
    const b = faceColorAttr.getZ(i)
    let c = eyeCol
    if (g >= r && g >= b && g > 0.5) c = browCol
    else if (b >= r && b >= g && b > 0.5) c = lipCol

    out[i * 3] = c.r
    out[i * 3 + 1] = c.g
    out[i * 3 + 2] = c.b
  }
  return out
}

/**
 * Assemble a complete character into a single `SkinnedMesh` (1 draw call) using
 * the shared `M_Palette` + `M_Face` material, baked morphs, hidden-region culling,
 * palette/tint color baking, and merged rigid accessories.
 */
export function assembleCharacter(input: AssembleCharacterInput): AssembledCharacter {
  const { appearance } = input
  const base = appearance.base
  const bodyRegions = input.bodyRegions ?? DEFAULT_BODY_REGIONS
  const regionIdByName = new Map<string, number>(bodyRegions.map((name, idx) => [name, idx]))

  const extractedBody = extractBody(input.body)
  const { skeleton: clonedSkeleton, rootBones } = cloneSkeletonHierarchy(extractedBody.skeleton)
  const boneIndexByName = new Map<string, number>(
    clonedSkeleton.bones.map((b, idx) => [b.name, idx]),
  )

  const morphSummary = resolveDefaultMorphSummary(input.morphWeights, appearance.body)
  const heightScale =
    input.heightScale ??
    (appearance.body?.height !== undefined ? 0.92 + appearance.body.height * 0.16 : 1.0)

  const inputParts = input.parts ?? []
  const hiddenSlots = new Set<string>()
  for (const p of inputParts) {
    if (p.hides) {
      for (const s of p.hides) hiddenSlots.add(s)
    } else if (p.slot === 'fullbody') {
      hiddenSlots.add('top')
      hiddenSlots.add('bottom')
    }
  }
  const activeParts = inputParts.filter((p) => !hiddenSlots.has(p.slot))

  const hideRegionIds = new Set<number>()
  const hideRanges: Array<readonly number[]> = []
  for (const part of activeParts) {
    const baseMeta = part.meta?.bases?.[base]
    const regions = baseMeta?.hideRegions ?? part.meta?.hideRegions
    if (regions) {
      for (const rName of regions) {
        const rid = regionIdByName.get(rName)
        if (rid !== undefined) hideRegionIds.add(rid)
      }
    }
    const ranges = baseMeta?.hideRanges ?? part.meta?.hideRanges
    if (ranges) {
      for (const rng of ranges) hideRanges.push(rng)
    }
  }

  const toMerge: THREE.BufferGeometry[] = []
  const extraMeshes: THREE.Mesh[] = []

  // 1. Body (M_Palette): bake morphs -> cull hidden regions -> remap skin -> clear region IDs to white
  const bakedBody = bakeMorphGeometry(
    extractedBody.bodyGeometry,
    morphSummary,
    extractedBody.bodyMorphDictionary,
  )
  const filteredBody = filterHiddenBodyTriangles(bakedBody, hideRegionIds, hideRanges)
  bakedBody.dispose()
  const bodyUv = ensureFloatUvAttribute(filteredBody)
  const skinPairs = buildSkinUvPairs(appearance.skin, appearance.face.blush ?? true)
  if (bodyUv) remapCellUvsInPlace(bodyUv, skinPairs)
  fillWhiteVertexColor(filteredBody)
  normalizeForMerge(filteredBody, 0)
  toMerge.push(filteredBody)

  // 2. Wardrobe & accessory parts
  const hairPairs = buildHairUvPairs(appearance.hair.color)
  const material = getSharedCharacterMaterial()

  for (const part of activeParts) {
    const { geometry: srcGeom, isSkinned, morphTargetDictionary } = extractPartMesh(part.asset)
    const kind = part.meta?.kind ?? (isSkinned ? 'skinned' : 'rigid')
    const baseMeta = part.meta?.bases?.[base]
    const swatches: TintSwatches = {
      ...part.defaultColors,
      ...appearance.colors?.[part.id],
    }

    let partGeom: THREE.BufferGeometry
    if (kind === 'skinned') {
      partGeom = bakeMorphGeometry(srcGeom, morphSummary, morphTargetDictionary)
      bakeTintColors(partGeom, swatches)
      const uv = ensureFloatUvAttribute(partGeom)
      if (uv) {
        if (part.slot === 'hair') remapCellUvsInPlace(uv, hairPairs)
        remapCellUvsInPlace(uv, skinPairs)
      }
      normalizeForMerge(partGeom, 0)
      toMerge.push(partGeom)
    } else {
      const boneName = part.meta?.bone ?? defaultBoneForSlot(part.slot)
      const boneIdx = boneIndexByName.get(boneName)
      if (boneIdx === undefined) {
        throw new Error(`assembleCharacter: attach bone "${boneName}" not found in skeleton`)
      }
      const scale = baseMeta?.scale ?? part.meta?.scale ?? 1
      const offset = baseMeta?.offset ?? part.meta?.offset
      const shouldMerge = part.meta?.merge !== false

      if (shouldMerge) {
        partGeom = mergeRigidPart(srcGeom, boneIdx, { scale, offset })
        bakeTintColors(partGeom, swatches)
        const uv = ensureFloatUvAttribute(partGeom)
        if (uv) {
          if (part.slot === 'hair') remapCellUvsInPlace(uv, hairPairs)
          remapCellUvsInPlace(uv, skinPairs)
        }
        normalizeForMerge(partGeom, 0)
        toMerge.push(partGeom)
      } else {
        partGeom = srcGeom.clone()
        if (scale !== 1) partGeom.scale(scale, scale, scale)
        const ox = offset?.[0] ?? 0
        const oy = offset?.[1] ?? 0
        const oz = offset?.[2] ?? 0
        if (ox !== 0 || oy !== 0 || oz !== 0) {
          partGeom.translate(ox, oy, oz)
        }
        partGeom.applyMatrix4(clonedSkeleton.boneInverses[boneIdx]!)
        bakeTintColors(partGeom, swatches)
        const uv = ensureFloatUvAttribute(partGeom)
        if (uv) {
          if (part.slot === 'hair') remapCellUvsInPlace(uv, hairPairs)
          remapCellUvsInPlace(uv, skinPairs)
        }
        normalizeForMerge(partGeom, 0)
        const vCount = partGeom.getAttribute('position').count
        partGeom.setAttribute('aFade', new THREE.Float32BufferAttribute(new Float32Array(vCount).fill(1), 1))
        partGeom.setAttribute('aSat', new THREE.Float32BufferAttribute(new Float32Array(vCount).fill(1), 1))
        const extra = new THREE.Mesh(partGeom, material)
        extra.name = part.id
        attachPerObjectFadeSatSync(extra)
        clonedSkeleton.bones[boneIdx]!.add(extra)
        extraMeshes.push(extra)
      }
    }
  }

  // 3. Face quads (M_Face) appended last so we know their exact vertex slice
  let faceVertexStart = 0
  let faceVertexCount = 0
  let faceOrigColors: THREE.BufferAttribute | null = null

  if (extractedBody.faceGeometry) {
    for (const g of toMerge) {
      faceVertexStart += g.getAttribute('position').count
    }

    const bakedFace = bakeMorphGeometry(
      extractedBody.faceGeometry,
      morphSummary,
      extractedBody.faceMorphDictionary,
    )
    const srcFaceColor = extractedBody.faceGeometry.getAttribute('color')
    faceVertexCount = bakedFace.getAttribute('position').count

    const origColorCopy = new Float32Array(faceVertexCount * 3)
    if (srcFaceColor) {
      for (let i = 0; i < faceVertexCount; i += 1) {
        origColorCopy[i * 3] = srcFaceColor.getX(i)
        origColorCopy[i * 3 + 1] = srcFaceColor.getY(i)
        origColorCopy[i * 3 + 2] = srcFaceColor.getZ(i)
      }
    }
    faceOrigColors = new THREE.Float32BufferAttribute(origColorCopy, 3)

    const eyeHex = resolveSwatchHex(appearance.face.eyeColor) ?? '#5B3A21'
    const browHex = resolveSwatchHex(appearance.hair.color) ?? '#1E1A19'
    const lipSwatch = appearance.colors?.mouth?.primary ?? `${appearance.skin}_lip`
    const lipHex = resolveSwatchHex(lipSwatch) ?? '#D87D72'

    const bakedFaceRgb = bakeFaceVertexColors(faceOrigColors, eyeHex, browHex, lipHex)
    bakedFace.setAttribute('color', new THREE.Float32BufferAttribute(bakedFaceRgb, 3))
    normalizeForMerge(bakedFace, 1)
    toMerge.push(bakedFace)
  }

  // 4. Merge into one single BufferGeometry (1 draw call)
  const mergedGeometry = mergeGeometries(toMerge, false)
  for (const g of toMerge) g.dispose()

  if (!mergedGeometry) {
    throw new Error('assembleCharacter: mergeGeometries returned null')
  }

  let faceRegions: FaceRegions | null = null
  if (faceVertexCount > 0 && faceOrigColors) {
    const mergedUv = mergedGeometry.getAttribute('uv') as THREE.BufferAttribute
    faceRegions = createFaceRegions(mergedUv, faceOrigColors, {
      startVertex: faceVertexStart,
      vertexCount: faceVertexCount,
      atlas: input.faceAtlas,
      eyes: appearance.face.eyes,
      brows: appearance.face.brows,
      mouth: appearance.face.mouth,
    })
    applyFaceCells(mergedUv, faceRegions, {
      eyes: appearance.face.eyes,
      brows: appearance.face.brows,
      mouth: appearance.face.mouth,
      eyeState: 'open',
    })
  }

  const totalVerts = mergedGeometry.getAttribute('position').count
  mergedGeometry.setAttribute(
    'aFade',
    new THREE.Float32BufferAttribute(new Float32Array(totalVerts).fill(1), 1),
  )
  mergedGeometry.setAttribute(
    'aSat',
    new THREE.Float32BufferAttribute(new Float32Array(totalVerts).fill(1), 1),
  )

  mergedGeometry.boundingSphere = new THREE.Sphere(
    STATIC_BOUNDS_CENTER.clone(),
    STATIC_BOUNDS_RADIUS,
  )
  mergedGeometry.computeBoundingSphere = () => {}

  const mesh = new THREE.SkinnedMesh(mergedGeometry, material)
  mesh.name = 'character'
  mesh.boundingSphere = new THREE.Sphere(
    STATIC_BOUNDS_CENTER.clone(),
    STATIC_BOUNDS_RADIUS,
  )
  for (const rootBone of rootBones) {
    mesh.add(rootBone)
  }
  mesh.updateMatrixWorld(true)
  mesh.bind(clonedSkeleton, new THREE.Matrix4())
  attachPerObjectFadeSatSync(mesh)

  const findBone = (name: string): THREE.Bone | null => {
    const idx = boneIndexByName.get(name)
    return idx !== undefined ? (clonedSkeleton.bones[idx] ?? null) : null
  }

  return {
    mesh,
    extraMeshes,
    skeleton: clonedSkeleton,
    attach: {
      handR: findBone('Attach_HandR'),
      handL: findBone('Attach_HandL'),
      head: findBone('Attach_Head'),
    },
    faceRegions,
    heightScale,
    morphSummary,
    dispose() {
      mergedGeometry.dispose()
      for (const extra of extraMeshes) {
        extra.geometry.dispose()
      }
    },
  }
}

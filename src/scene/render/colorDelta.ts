/**
 * Pure color space conversion and perceptual difference (CIE76 ΔE) helpers.
 * Used for verifying color fidelity (e.g. palette swatches on unlit quads under NoToneMapping).
 */

export interface RgbColor {
  r: number // 0..255
  g: number // 0..255
  b: number // 0..255
}

export interface LabColor {
  l: number // 0..100
  a: number // -128..127
  b: number // -128..127
}

/** Standard D65 2-degree observer reference white. */
const D65_XN = 0.95047
const D65_YN = 1.0
const D65_ZN = 1.08883

const DELTA = 6 / 29
const DELTA_CUBED = DELTA * DELTA * DELTA // 216 / 24389 ≈ 0.008856
const FACTOR = (1 / 3) * (29 / 6) * (29 / 6) // 841 / 108 ≈ 7.787037
const OFFSET = 4 / 29 // 16 / 116 ≈ 0.137931

/**
 * Parses hex color string (e.g. "#0F766E", "0f766e", "#FFF") into 0..255 RGB.
 */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, '').trim()
  if (clean.length === 3) {
    const r = parseInt(clean[0]! + clean[0]!, 16)
    const g = parseInt(clean[1]! + clean[1]!, 16)
    const b = parseInt(clean[2]! + clean[2]!, 16)
    return [r, g, b]
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16)
    const g = parseInt(clean.slice(2, 4), 16)
    const b = parseInt(clean.slice(4, 6), 16)
    return [r, g, b]
  }
  throw new Error(`Invalid hex color: "${hex}"`)
}

/**
 * Converts sRGB [0..255] to linear RGB [0..1] using sRGB transfer function.
 */
function srgbToLinear(c: number): number {
  const v = Math.max(0, Math.min(255, c)) / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/**
 * Converts sRGB [0..255] to CIE XYZ under standard illuminant D65.
 */
export function srgbToXyz(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const rLin = srgbToLinear(r)
  const gLin = srgbToLinear(g)
  const bLin = srgbToLinear(b)

  const x = 0.4124564 * rLin + 0.3575761 * gLin + 0.1804375 * bLin
  const y = 0.2126729 * rLin + 0.7151522 * gLin + 0.072175 * bLin
  const z = 0.0193339 * rLin + 0.119192 * gLin + 0.9503041 * bLin

  return [x, y, z]
}

function fXyz(t: number): number {
  return t > DELTA_CUBED ? Math.cbrt(t) : FACTOR * t + OFFSET
}

/**
 * Converts CIE XYZ to CIE L*a*b*.
 */
export function xyzToLab(
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const fx = fXyz(x / D65_XN)
  const fy = fXyz(y / D65_YN)
  const fz = fXyz(z / D65_ZN)

  const l = 116 * fy - 16
  const a = 500 * (fx - fy)
  const b = 200 * (fy - fz)

  return [l, a, b]
}

/**
 * Converts sRGB [0..255] to CIE L*a*b*.
 */
export function rgbToLab(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const [x, y, z] = srgbToXyz(r, g, b)
  return xyzToLab(x, y, z)
}

/**
 * Computes CIE76 color difference (ΔE*ab) between two colors.
 * Colors can be hex strings (e.g. "#0F766E") or RGB [0..255] tuples.
 */
export function deltaE(
  c1: string | readonly [number, number, number],
  c2: string | readonly [number, number, number],
): number {
  const [r1, g1, b1] = typeof c1 === 'string' ? hexToRgb(c1) : c1
  const [r2, g2, b2] = typeof c2 === 'string' ? hexToRgb(c2) : c2

  const [l1, a1, b1_lab] = rgbToLab(r1, g1, b1)
  const [l2, a2, b2_lab] = rgbToLab(r2, g2, b2)

  const dl = l1 - l2
  const da = a1 - a2
  const db = b1_lab - b2_lab

  return Math.sqrt(dl * dl + da * da + db * db)
}

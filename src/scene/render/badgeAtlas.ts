import * as THREE from 'three'
import type { Platform } from '@/domain/config'
import { atlasGrid, makeCanvas, type AtlasGrid } from './AtlasBillboards'
import { getSwatchHex } from './palette'

const CELL_PX = 96
export const BADGE_FONT_FAMILY = 'Be Vietnam Pro'
const FONT_URL = `${import.meta.env.BASE_URL}assets/fonts/BeVietnamPro-SemiBold.ttf`
const FALLBACK = 'sans-serif'

export type BadgeSource = Pick<Platform, 'key' | 'badge'>

export interface BadgeAtlasLayout {
  grid: AtlasGrid<string>
  /** Text and swatch per cell, in cell order. */
  badges: { key: string; text: string; swatch: string }[]
}

/**
 * Pure: one cell per platform row (`platforms.json` → badge). A new platform
 * row gets a new cell; no code or image file needed (R3, D2).
 */
export function buildBadgeAtlasLayout(platforms: readonly BadgeSource[]): BadgeAtlasLayout {
  const seen = new Set<string>()
  const badges: BadgeAtlasLayout['badges'] = []
  for (const p of platforms) {
    if (seen.has(p.key)) continue
    seen.add(p.key)
    badges.push({ key: p.key, text: p.badge.text, swatch: p.badge.swatch })
  }
  return { grid: atlasGrid(badges.map((b) => b.key), CELL_PX), badges }
}

let fontPromise: Promise<boolean> | null = null

/** Loads Be Vietnam Pro once for canvas drawing; resolves false when it cannot. */
export function loadBadgeFont(): Promise<boolean> {
  if (fontPromise) return fontPromise
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
    fontPromise = Promise.resolve(false)
    return fontPromise
  }
  const face = new FontFace(BADGE_FONT_FAMILY, `url(${FONT_URL})`, { weight: '600' })
  fontPromise = face
    .load()
    .then((loaded) => {
      document.fonts.add(loaded)
      return true
    })
    .catch(() => false)
  return fontPromise
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Paints every badge: a rounded square in the platform's swatch and its
 * short text in white-ish paper colour. Null without a 2D canvas.
 */
export function paintBadgeAtlas(layout: BadgeAtlasLayout, fontReady: boolean): THREE.CanvasTexture | null {
  const { grid } = layout
  const surface = makeCanvas(grid.width, grid.height)
  if (!surface) return null
  const { canvas, ctx } = surface
  ctx.clearRect(0, 0, grid.width, grid.height)
  const s = grid.cellPx
  const pad = s * 0.06
  const family = fontReady ? `"${BADGE_FONT_FAMILY}", ${FALLBACK}` : FALLBACK
  const textColor = getSwatchHex('paper')
  for (const badge of layout.badges) {
    const cell = grid.cells.get(badge.key)
    if (!cell) continue
    const x = cell.col * s + pad
    const y = cell.row * s + pad
    const w = s - pad * 2
    ctx.fillStyle = getSwatchHex(badge.swatch)
    roundRect(ctx, x, y, w, w, s * 0.2)
    ctx.fill()
    ctx.lineWidth = s * 0.05
    ctx.strokeStyle = textColor
    ctx.stroke()
    // Shrink long labels ("TTB") to fit the square.
    const chars = Math.max(1, [...badge.text].length)
    const px = Math.round(Math.min(s * 0.46, (w * 1.45) / chars))
    ctx.font = `600 ${px}px ${family}`
    ctx.fillStyle = textColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(badge.text, x + w / 2, y + w / 2 + px * 0.04, w * 0.86)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

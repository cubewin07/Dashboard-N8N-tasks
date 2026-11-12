import type * as THREE from 'three'
import { STATUS_ICON_KEYS, type StatusIconKey } from '@/domain/visual'
import { atlasGrid, glyphText, paintMaskAtlas, type GlyphPainter } from './AtlasBillboards'

const CELL_PX = 64

/** Where each status icon sits in the generated atlas (pure, stable). */
export const STATUS_ATLAS = atlasGrid(STATUS_ICON_KEYS, CELL_PX)

const drawStatusGlyph: GlyphPainter<StatusIconKey> = (ctx, key, cx, cy, r) => {
  const u = r / 10
  ctx.lineWidth = u * 1.6
  switch (key) {
    case 'laptop':
      ctx.strokeRect(cx - u * 5, cy - u * 5, u * 10, u * 7)
      ctx.beginPath()
      ctx.moveTo(cx - u * 7, cy + u * 4)
      ctx.lineTo(cx + u * 7, cy + u * 4)
      ctx.stroke()
      break
    case 'magnifier':
      ctx.beginPath()
      ctx.arc(cx - u * 1.5, cy - u * 1.5, u * 4, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = u * 2.4
      ctx.beginPath()
      ctx.moveTo(cx + u * 1.5, cy + u * 1.5)
      ctx.lineTo(cx + u * 5.5, cy + u * 5.5)
      ctx.stroke()
      break
    case 'handshake':
      // Two hands meeting: two thick strokes clasped in the middle.
      ctx.lineWidth = u * 2.6
      ctx.beginPath()
      ctx.moveTo(cx - u * 7, cy - u * 1)
      ctx.lineTo(cx - u * 2, cy + u * 2)
      ctx.lineTo(cx + u * 3, cy - u * 1)
      ctx.moveTo(cx + u * 7, cy - u * 1)
      ctx.lineTo(cx + u * 2, cy + u * 3)
      ctx.stroke()
      break
    case 'question':
      glyphText(ctx, '?', cx, cy, r * 1.5)
      break
    case 'exclamation':
      glyphText(ctx, '!', cx, cy, r * 1.5)
      break
    case 'speech':
      ctx.beginPath()
      ctx.ellipse(cx, cy - u * 1, u * 6, u * 4.5, 0, 0, Math.PI * 2)
      ctx.stroke()
      for (const dx of [-2.5, 0, 2.5]) {
        ctx.beginPath()
        ctx.arc(cx + dx * u, cy - u * 1, u * 0.9, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.beginPath()
      ctx.moveTo(cx - u * 2, cy + u * 3)
      ctx.lineTo(cx - u * 4, cy + u * 6)
      ctx.stroke()
      break
    case 'paper':
      ctx.beginPath()
      ctx.moveTo(cx - u * 4, cy - u * 6)
      ctx.lineTo(cx + u * 2, cy - u * 6)
      ctx.lineTo(cx + u * 4, cy - u * 4)
      ctx.lineTo(cx + u * 4, cy + u * 6)
      ctx.lineTo(cx - u * 4, cy + u * 6)
      ctx.closePath()
      ctx.stroke()
      ctx.lineWidth = u
      for (const dy of [-1.5, 1, 3.5]) {
        ctx.beginPath()
        ctx.moveTo(cx - u * 2, cy + dy * u)
        ctx.lineTo(cx + u * 2, cy + dy * u)
        ctx.stroke()
      }
      break
    default: {
      const exhaustive: never = key
      return exhaustive
    }
  }
}

/** The status icon atlas, drawn on a 2D canvas (no image files). Null without a canvas. */
export function createStatusAtlasTexture(): THREE.CanvasTexture | null {
  return paintMaskAtlas(STATUS_ATLAS, 'disc', drawStatusGlyph)
}

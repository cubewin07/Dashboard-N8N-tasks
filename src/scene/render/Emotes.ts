import type * as THREE from 'three'
import type { EmployeeId } from '@/domain/primitives'
import { EMOTE_KEYS, type EmoteKey } from '@/domain/visual'
import { visualLanguage } from '@/office/visualConfig'
import { AtlasBillboards, atlasGrid, glyphText, paintMaskAtlas, type GlyphPainter } from './AtlasBillboards'
import { getSwatchColor } from './palette'

/** Where each emote sits in the generated atlas (pure, stable). */
export const EMOTE_ATLAS = atlasGrid(EMOTE_KEYS, 64)

const BUBBLE_SWATCH = 'paper'
const GLYPH_SWATCH = 'neutral_900'
/** Seconds a new bubble takes to grow in (skipped under reduced motion). */
const POP_SECONDS = 0.22

export interface EmoteCandidate {
  /** Index into the frame's people. */
  index: number
  x: number
  y: number
  z: number
}

/**
 * The emotes to draw this frame (R12): nearest to the camera first, at most
 * `max`. Pure; ties keep input order. Writes into `out` and returns it.
 */
export function selectEmotes(
  candidates: readonly EmoteCandidate[],
  camera: { x: number; y: number; z: number },
  max: number,
  out: EmoteCandidate[] = [],
): EmoteCandidate[] {
  out.length = 0
  if (max <= 0) return out
  const scored = candidates.map((c, order) => ({
    c,
    order,
    d: (c.x - camera.x) ** 2 + (c.y - camera.y) ** 2 + (c.z - camera.z) ** 2,
  }))
  scored.sort((a, b) => a.d - b.d || a.order - b.order)
  for (let i = 0; i < scored.length && i < max; i += 1) out.push(scored[i]!.c)
  return out
}

const drawEmoteGlyph: GlyphPainter<EmoteKey> = (ctx, key, cx, cy, r) => {
  const u = r / 10
  ctx.lineWidth = u * 1.5
  switch (key) {
    case 'talk':
      for (const dx of [-3.4, 0, 3.4]) {
        ctx.beginPath()
        ctx.arc(cx + dx * u, cy, u * 1.3, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'think':
      glyphText(ctx, '?', cx, cy, r * 1.3)
      break
    case 'stuck':
      glyphText(ctx, '!', cx, cy, r * 1.3)
      break
    case 'note':
      ctx.beginPath()
      ctx.ellipse(cx - u * 2, cy + u * 3.5, u * 2.4, u * 1.8, -0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx + u * 0.3, cy + u * 3)
      ctx.lineTo(cx + u * 0.3, cy - u * 5.5)
      ctx.lineTo(cx + u * 4, cy - u * 3)
      ctx.stroke()
      break
    case 'zzz':
      glyphText(ctx, 'Z', cx - u * 2, cy + u * 1.5, r * 1.0)
      glyphText(ctx, 'z', cx + u * 3.5, cy - u * 3, r * 0.7)
      break
    case 'heart':
      ctx.beginPath()
      ctx.moveTo(cx, cy + u * 5)
      ctx.bezierCurveTo(cx - u * 8, cy - u * 1, cx - u * 4, cy - u * 7, cx, cy - u * 3)
      ctx.bezierCurveTo(cx + u * 4, cy - u * 7, cx + u * 8, cy - u * 1, cx, cy + u * 5)
      ctx.fill()
      break
    case 'coffee':
      ctx.fillRect(cx - u * 4, cy - u * 1, u * 6.5, u * 5.5)
      ctx.beginPath()
      ctx.arc(cx + u * 3.3, cy + u * 1.5, u * 1.8, -Math.PI / 2, Math.PI / 2)
      ctx.stroke()
      ctx.lineWidth = u
      for (const dx of [-2, 0.5]) {
        ctx.beginPath()
        ctx.moveTo(cx + dx * u, cy - u * 2.5)
        ctx.quadraticCurveTo(cx + (dx + 1.2) * u, cy - u * 4, cx + dx * u, cy - u * 5.5)
        ctx.stroke()
      }
      break
    case 'ball':
      ctx.beginPath()
      ctx.arc(cx, cy, u * 4, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'wave':
      ctx.beginPath()
      ctx.arc(cx, cy + u * 2, u * 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = u * 1.4
      for (const a of [-0.9, -0.3, 0.3, 0.9]) {
        ctx.beginPath()
        ctx.moveTo(cx + Math.sin(a) * u * 2.5, cy + u * 2 - Math.cos(a) * u * 2.5)
        ctx.lineTo(cx + Math.sin(a) * u * 6.5, cy + u * 2 - Math.cos(a) * u * 6.5)
        ctx.stroke()
      }
      break
    default: {
      const exhaustive: never = key
      return exhaustive
    }
  }
}

/** The emote atlas, drawn on a 2D canvas. Null without a canvas (tests). */
export function createEmoteAtlasTexture(): THREE.CanvasTexture | null {
  return paintMaskAtlas(EMOTE_ATLAS, 'bubble', drawEmoteGlyph)
}

/**
 * Emote bubbles (P05-T10): one instanced billboard; the caller passes the
 * already-capped selection. New bubbles pop in, except under reduced motion.
 */
export class Emotes {
  readonly layer: AtlasBillboards
  private readonly texture: THREE.CanvasTexture | null
  private readonly started = new Map<EmployeeId, { key: EmoteKey; at: number; seen: number }>()
  private time = 0
  private frame = 0
  private motion = 1

  constructor(capacity = visualLanguage.emotes.max) {
    const size = visualLanguage.emotes.size
    this.layer = new AtlasBillboards({
      name: 'emotes',
      capacity,
      mode: 'mask',
      size,
      // Left of the status icon, at the same height.
      offset: [-(visualLanguage.icon.size + size) / 2 - 0.02, visualLanguage.icon.gap + visualLanguage.icon.size / 2],
      glyphColor: getSwatchColor(GLYPH_SWATCH),
      renderOrder: 13,
    })
    this.texture = createEmoteAtlasTexture()
    this.layer.setTexture(this.texture)
  }

  get object(): THREE.Object3D {
    return this.layer.mesh
  }

  setReducedMotion(reduced: boolean): void {
    this.motion = reduced ? 0 : 1
  }

  begin(dt: number): void {
    this.time += dt
    this.frame += 1
    this.layer.begin()
  }

  push(id: EmployeeId, x: number, y: number, z: number, key: EmoteKey): void {
    const cell = EMOTE_ATLAS.cells.get(key)
    if (!cell) return
    let s = this.started.get(id)
    if (!s || s.key !== key || this.frame - s.seen > 1) {
      s = { key, at: this.time, seen: this.frame }
      this.started.set(id, s)
    }
    s.seen = this.frame
    const age = this.time - s.at
    const pop = this.motion === 0 ? 1 : Math.min(1, age / POP_SECONDS)
    // Ease out with a small overshoot.
    const scale = pop >= 1 ? 1 : 1 - (1 - pop) ** 2 + Math.sin(pop * Math.PI) * 0.15
    this.layer.push(x, y, z, cell, getSwatchColor(BUBBLE_SWATCH), Math.max(0.05, scale))
  }

  end(): number {
    if (this.frame % 120 === 0) {
      for (const [id, s] of this.started) if (this.frame - s.seen > 120) this.started.delete(id)
    }
    return this.layer.end()
  }

  dispose(): void {
    this.layer.dispose()
    this.texture?.dispose()
    this.started.clear()
  }
}

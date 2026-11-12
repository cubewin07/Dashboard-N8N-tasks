import * as THREE from 'three'

/** One cell of a generated atlas, in UV space (v up, as three samples it). */
export interface AtlasCell {
  col: number
  row: number
  u0: number
  v0: number
  du: number
  dv: number
}

export interface AtlasGrid<K extends string> {
  cols: number
  rows: number
  cellPx: number
  width: number
  height: number
  cells: Map<K, AtlasCell>
}

/**
 * Square cells, row by row from the top-left of the canvas. Pure: the same
 * keys in the same order give the same layout, a new key gets a new cell.
 */
export function atlasGrid<K extends string>(keys: readonly K[], cellPx: number): AtlasGrid<K> {
  const unique = [...new Set(keys)]
  const cols = Math.max(1, Math.ceil(Math.sqrt(unique.length)))
  const rows = Math.max(1, Math.ceil(unique.length / cols))
  const cells = new Map<K, AtlasCell>()
  unique.forEach((key, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    cells.set(key, {
      col,
      row,
      u0: col / cols,
      // Canvas rows go down, texture v goes up (flipY).
      v0: 1 - (row + 1) / rows,
      du: 1 / cols,
      dv: 1 / rows,
    })
  })
  return { cols, rows, cellPx, width: cols * cellPx, height: rows * cellPx, cells }
}

/** A 2D canvas, or null where there is none (tests, workers without OffscreenCanvas). */
export function makeCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
} | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  let ctx: CanvasRenderingContext2D | null
  try {
    ctx = canvas.getContext('2d')
  } catch {
    ctx = null
  }
  return ctx ? { canvas, ctx } : null
}

/**
 * How the atlas is read:
 * - `mask`: R = background shape, G = glyph. The background takes the
 *   instance colour, the glyph `glyphColor`. The atlas itself has no colour,
 *   so one cell serves every status.
 * - `rgba`: the texture is the final picture (platform badges).
 */
export type AtlasMode = 'mask' | 'rgba'

export interface BillboardOptions {
  name: string
  capacity: number
  mode: AtlasMode
  /** World size of one billboard (m). */
  size: number
  /** Offset from the anchor in view space (m): x right, y up. */
  offset: [number, number]
  glyphColor?: THREE.Color
  renderOrder?: number
}

const VERTEX = /* glsl */ `
attribute vec3 aCenter;
attribute vec4 aCell;
attribute vec3 aTint;
attribute float aScale;
uniform float uSize;
uniform vec2 uOffset;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vUv = aCell.xy + uv * aCell.zw;
  vTint = aTint;
  vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
  mv.xy += uOffset + position.xy * uSize * aScale;
  gl_Position = projectionMatrix * mv;
  if (aScale <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uGlyph;
uniform float uMaskMode;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vec4 t = texture2D(uMap, vUv);
  vec4 c;
  if (uMaskMode > 0.5) {
    c = vec4(mix(vTint, uGlyph, t.g), t.r);
  } else {
    c = t;
  }
  if (c.a < 0.04) discard;
  gl_FragColor = c;
  #include <colorspace_fragment>
}
`

const PLACEHOLDER = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1)
PLACEHOLDER.needsUpdate = true

/**
 * One draw call for many camera-facing quads that each show one atlas cell.
 * Per instance: world anchor, atlas cell, tint, scale (0 hides). Used by the
 * status icons, platform badges and emotes (P05 D1).
 */
export class AtlasBillboards {
  readonly mesh: THREE.Mesh
  readonly material: THREE.ShaderMaterial
  private readonly geometry: THREE.InstancedBufferGeometry
  private readonly center: THREE.InstancedBufferAttribute
  private readonly cell: THREE.InstancedBufferAttribute
  private readonly tint: THREE.InstancedBufferAttribute
  private readonly scale: THREE.InstancedBufferAttribute
  readonly capacity: number
  private used = 0

  constructor(o: BillboardOptions) {
    this.capacity = o.capacity
    const base = new THREE.PlaneGeometry(1, 1)
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.index = base.index
    geometry.setAttribute('position', base.getAttribute('position'))
    geometry.setAttribute('uv', base.getAttribute('uv'))
    const attr = (size: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(o.capacity * size), size)
      a.setUsage(THREE.DynamicDrawUsage)
      return a
    }
    this.center = attr(3)
    this.cell = attr(4)
    this.tint = attr(3)
    this.scale = attr(1)
    geometry.setAttribute('aCenter', this.center)
    geometry.setAttribute('aCell', this.cell)
    geometry.setAttribute('aTint', this.tint)
    geometry.setAttribute('aScale', this.scale)
    geometry.instanceCount = 0
    this.geometry = geometry

    this.material = new THREE.ShaderMaterial({
      name: o.name,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uMap: { value: PLACEHOLDER },
        uGlyph: { value: (o.glyphColor ?? new THREE.Color(1, 1, 1)).clone() },
        uMaskMode: { value: o.mode === 'mask' ? 1 : 0 },
        uSize: { value: o.size },
        uOffset: { value: new THREE.Vector2(o.offset[0], o.offset[1]) },
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.name = o.name
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = o.renderOrder ?? 10
    this.mesh.raycast = () => {}
    base.dispose()
  }

  setTexture(texture: THREE.Texture | null): void {
    this.material.uniforms.uMap!.value = texture ?? PLACEHOLDER
  }

  /** Start writing a frame. */
  begin(): void {
    this.used = 0
  }

  /** Add one billboard; false when the layer is full. */
  push(x: number, y: number, z: number, cell: AtlasCell, tint: THREE.Color | null, scale = 1): boolean {
    if (this.used >= this.capacity) return false
    const i = this.used
    this.center.setXYZ(i, x, y, z)
    this.cell.setXYZW(i, cell.u0, cell.v0, cell.du, cell.dv)
    if (tint) this.tint.setXYZ(i, tint.r, tint.g, tint.b)
    else this.tint.setXYZ(i, 1, 1, 1)
    this.scale.setX(i, scale)
    this.used += 1
    return true
  }

  /** Finish the frame: upload and draw `used` instances. */
  end(): number {
    this.geometry.instanceCount = this.used
    if (this.used > 0) {
      this.center.needsUpdate = true
      this.cell.needsUpdate = true
      this.tint.needsUpdate = true
      this.scale.needsUpdate = true
    }
    this.mesh.visible = this.used > 0
    return this.used
  }

  get count(): number {
    return this.used
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}

/** Draws one glyph in the green channel, centred on (cx, cy), inside radius r. */
export type GlyphPainter<K extends string> = (
  ctx: CanvasRenderingContext2D,
  key: K,
  cx: number,
  cy: number,
  r: number,
) => void

/**
 * Paints a `mask` atlas: opaque black, the background shape in red, the
 * glyph added in green. Returns null without a 2D canvas (unit tests).
 */
export function paintMaskAtlas<K extends string>(
  grid: AtlasGrid<K>,
  background: 'disc' | 'bubble',
  glyph: GlyphPainter<K>,
): THREE.CanvasTexture | null {
  const surface = makeCanvas(grid.width, grid.height)
  if (!surface) return null
  const { canvas, ctx } = surface
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, grid.width, grid.height)
  const s = grid.cellPx
  for (const [key, cell] of grid.cells) {
    const cx = (cell.col + 0.5) * s
    const cy = (cell.row + 0.5) * s
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#ff0000'
    ctx.beginPath()
    if (background === 'disc') {
      ctx.arc(cx, cy, s * 0.46, 0, Math.PI * 2)
    } else {
      // A round speech bubble with a small tail pointing down-left.
      ctx.arc(cx, cy - s * 0.05, s * 0.4, 0, Math.PI * 2)
      ctx.moveTo(cx - s * 0.22, cy + s * 0.22)
      ctx.lineTo(cx - s * 0.34, cy + s * 0.46)
      ctx.lineTo(cx - s * 0.02, cy + s * 0.3)
      ctx.closePath()
    }
    ctx.fill()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = '#00ff00'
    ctx.strokeStyle = '#00ff00'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.save()
    glyph(ctx, key, cx, background === 'disc' ? cy : cy - s * 0.05, s * 0.4)
    ctx.restore()
  }
  ctx.globalCompositeOperation = 'source-over'
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

/** A bold ASCII glyph ("?", "!", "Z") that needs no web font. */
export function glyphText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, px: number): void {
  ctx.font = `800 ${Math.round(px)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy + px * 0.05)
}

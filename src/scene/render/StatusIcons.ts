import type * as THREE from 'three'
import type { StatusIconKey } from '@/domain/visual'
import { visualLanguage } from '@/office/visualConfig'
import { AtlasBillboards } from './AtlasBillboards'
import { getSwatchColor } from './palette'
import { createStatusAtlasTexture, STATUS_ATLAS } from './statusAtlas'

/** Swatch of the glyph drawn on top of the status colour. */
const GLYPH_SWATCH = 'paper'

/**
 * Status icons above heads (P05-T02): one instanced billboard for the whole
 * building, each instance a cell of the generated status atlas, tinted with
 * the status colour.
 */
export class StatusIcons {
  readonly layer: AtlasBillboards
  private readonly texture: THREE.CanvasTexture | null

  constructor(capacity = 160) {
    this.layer = new AtlasBillboards({
      name: 'status-icons',
      capacity,
      mode: 'mask',
      size: visualLanguage.icon.size,
      offset: [0, visualLanguage.icon.gap + visualLanguage.icon.size / 2],
      glyphColor: getSwatchColor(GLYPH_SWATCH),
      renderOrder: 11,
    })
    this.texture = createStatusAtlasTexture()
    this.layer.setTexture(this.texture)
  }

  get object(): THREE.Object3D {
    return this.layer.mesh
  }

  begin(): void {
    this.layer.begin()
  }

  /** (x, y, z) = top of the head. */
  push(x: number, y: number, z: number, icon: StatusIconKey, color: THREE.Color): void {
    const cell = STATUS_ATLAS.cells.get(icon)
    if (cell) this.layer.push(x, y, z, cell, color)
  }

  end(): number {
    return this.layer.end()
  }

  dispose(): void {
    this.layer.dispose()
    this.texture?.dispose()
  }
}

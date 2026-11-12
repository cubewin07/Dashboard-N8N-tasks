import type * as THREE from 'three'
import { visualLanguage } from '@/office/visualConfig'
import { AtlasBillboards } from './AtlasBillboards'
import {
  buildBadgeAtlasLayout,
  loadBadgeFont,
  paintBadgeAtlas,
  type BadgeAtlasLayout,
  type BadgeSource,
} from './badgeAtlas'

/**
 * Platform badges beside the heads of people working on a platform
 * (P05-T03, R3): one instanced billboard; the atlas is drawn from
 * `config.platforms` and redrawn when that list changes.
 */
export class PlatformBadges {
  readonly layer: AtlasBillboards
  private platforms: readonly BadgeSource[] | null = null
  private layout: BadgeAtlasLayout = buildBadgeAtlasLayout([])
  private texture: THREE.CanvasTexture | null = null
  private fontReady = false
  private disposed = false

  constructor(capacity = 160) {
    const { size, offset } = visualLanguage.badge
    this.layer = new AtlasBillboards({
      name: 'platform-badges',
      capacity,
      mode: 'rgba',
      size,
      offset: [offset + size / 2, size * 0.1],
      renderOrder: 12,
    })
    void loadBadgeFont().then((ok) => {
      if (this.disposed || !ok) return
      this.fontReady = true
      this.repaint()
    })
  }

  get object(): THREE.Object3D {
    return this.layer.mesh
  }

  /** Cheap when the list is the same object as last time. */
  setPlatforms(platforms: readonly BadgeSource[]): void {
    if (platforms === this.platforms) return
    this.platforms = platforms
    this.layout = buildBadgeAtlasLayout(platforms)
    this.repaint()
  }

  private repaint(): void {
    this.texture?.dispose()
    this.texture = paintBadgeAtlas(this.layout, this.fontReady)
    this.layer.setTexture(this.texture)
  }

  begin(): void {
    this.layer.begin()
  }

  /** (x, y, z) = top of the head. Unknown platform keys draw nothing. */
  push(x: number, y: number, z: number, platformKey: string): void {
    const cell = this.layout.grid.cells.get(platformKey)
    if (cell) this.layer.push(x, y, z, cell, null)
  }

  end(): number {
    return this.layer.end()
  }

  dispose(): void {
    this.disposed = true
    this.layer.dispose()
    this.texture?.dispose()
  }
}

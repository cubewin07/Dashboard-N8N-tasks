import type * as THREE from 'three'
import type { FrameStats } from './frameStats'

/** `__office_debug.stats()` (P11-T01, performance.md §4). */
export interface OfficeStats {
  fps: number
  frameMsP95: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
  /** Chromium only (`performance.memory`); null elsewhere. */
  jsHeapMB: number | null
}

export function readStats(gl: THREE.WebGLRenderer, frames: FrameStats): OfficeStats {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  return {
    fps: frames.fps(),
    frameMsP95: frames.p95(),
    drawCalls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
    geometries: gl.info.memory.geometries,
    textures: gl.info.memory.textures,
    programs: gl.info.programs?.length ?? 0,
    jsHeapMB: memory ? Math.round((memory.usedJSHeapSize / 1048576) * 10) / 10 : null,
  }
}

let source: (() => OfficeStats) | null = null

/** The mounted scene registers itself; the overlay and `__office_debug.stats()` read it. */
export function setStatsSource(next: (() => OfficeStats) | null): void {
  source = next
}

export function currentStats(): OfficeStats | null {
  return source ? source() : null
}

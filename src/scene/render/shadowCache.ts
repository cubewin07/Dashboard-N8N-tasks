import { invalidate } from '@react-three/fiber'
import type * as THREE from 'three'
import { lightRig } from './Lights'

export interface Vector3Like {
  x: number
  y: number
  z: number
}

let shadowRenders = 0
let willRenderShadow = false
let pendingUpdate = true

/**
 * Returns the number of shadow map passes rendered so far.
 * Dev & E2E only counter exposed on `window.__office_debug.shadowRenders`.
 */
export function getShadowRenders(): number {
  return shadowRenders
}

/**
 * Resets the shadow renders counter (useful for test isolation).
 */
export function resetShadowRenders(): void {
  shadowRenders = 0
}

/**
 * Pure helper: checks whether the sun position has moved beyond `threshold` metres.
 */
export function hasSunMoved(
  prev: Vector3Like | readonly [number, number, number],
  next: Vector3Like | readonly [number, number, number],
  threshold = 0.05,
): boolean {
  const px = Array.isArray(prev) ? prev[0] : (prev as Vector3Like).x
  const py = Array.isArray(prev) ? prev[1] : (prev as Vector3Like).y
  const pz = Array.isArray(prev) ? prev[2] : (prev as Vector3Like).z

  const nx = Array.isArray(next) ? next[0] : (next as Vector3Like).x
  const ny = Array.isArray(next) ? next[1] : (next as Vector3Like).y
  const nz = Array.isArray(next) ? next[2] : (next as Vector3Like).z

  const dx = nx - px
  const dy = ny - py
  const dz = nz - pz
  return dx * dx + dy * dy + dz * dz > threshold * threshold
}

/**
 * Pure helper: checks whether sun light intensity has changed significantly.
 */
export function hasSunIntensityChanged(
  prev: number,
  next: number,
  threshold = 0.05,
): boolean {
  return Math.abs(next - prev) > threshold
}

/**
 * Request an update of the cached directional shadow map.
 * Sets `sun.shadow.needsUpdate = true` and invalidates R3F frame loop if demand-rendered.
 */
export function requestShadowUpdate(): void {
  pendingUpdate = true
  if (lightRig.sun?.shadow) {
    lightRig.sun.shadow.needsUpdate = true
  }
  try {
    invalidate()
  } catch {
    // In case called outside R3F context
  }
}

/**
 * Called when the sun directional light mounts or updates in the scene.
 */
export function initShadowLight(sun: THREE.DirectionalLight | null): void {
  if (!sun) return
  if (sun.shadow) {
    sun.shadow.autoUpdate = false
    if (pendingUpdate) {
      sun.shadow.needsUpdate = true
    }
  }
}

/**
 * Called in useFrame right before rendering.
 * Detects whether Three.js will execute a shadow map pass this frame.
 */
export function onBeforeRenderFrame(): void {
  const sun = lightRig.sun
  if (sun && sun.castShadow && (sun.shadow.autoUpdate || sun.shadow.needsUpdate)) {
    willRenderShadow = true
  }
}

/**
 * Called in addAfterEffect right after rendering.
 * If a shadow map was rendered, increments `shadowRenders`.
 */
export function onAfterRenderFrame(): void {
  if (willRenderShadow) {
    shadowRenders += 1
    willRenderShadow = false
    pendingUpdate = false
  }
}

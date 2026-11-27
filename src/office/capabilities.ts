/**
 * Capability check (P11 §3.5): probed once per page, because every probe creates a WebGL
 * context and browsers cap live contexts (about 16), so probing again could evict the
 * office canvas. The probe context is released straight away.
 */
export type Quality = 'high' | 'medium' | 'low' | 'off'
export type QualityChoice = 'auto' | Exclude<Quality, 'off'>

export interface Capabilities {
  webgl2: boolean
  maxTextureSize: number | null
  /** `navigator.deviceMemory` (GB, Chromium only, rounded down by the browser). */
  deviceMemoryGb: number | null
  cores: number | null
  /** Unmasked GPU name when the browser exposes it (diagnostics only). */
  renderer: string | null
}

let cached: Capabilities | null = null

/** Forget the cached probe (tests only). */
export function resetCapabilitiesProbe(): void {
  cached = null
}

function readGl(ctx: WebGL2RenderingContext): Pick<Capabilities, 'maxTextureSize' | 'renderer'> {
  let maxTextureSize: number | null = null
  let renderer: string | null = null
  try {
    if (typeof ctx.getParameter === 'function') {
      const max: unknown = ctx.getParameter(ctx.MAX_TEXTURE_SIZE)
      maxTextureSize = typeof max === 'number' ? max : null
      const info = ctx.getExtension?.('WEBGL_debug_renderer_info')
      const name: unknown = info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : null
      renderer = typeof name === 'string' ? name : null
    }
    ctx.getExtension?.('WEBGL_lose_context')?.loseContext()
  } catch {
    // A half-working context: keep what we read.
  }
  return { maxTextureSize, renderer }
}

export function probeCapabilities(): Capabilities {
  if (cached) return cached
  const nav: (Navigator & { deviceMemory?: number }) | undefined =
    typeof navigator === 'undefined' ? undefined : navigator
  const base = {
    deviceMemoryGb: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: typeof nav?.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
  }
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof window.WebGL2RenderingContext === 'undefined'
  ) {
    cached = { webgl2: false, maxTextureSize: null, renderer: null, ...base }
    return cached
  }
  try {
    const ctx = document.createElement('canvas').getContext('webgl2')
    cached = ctx
      ? { webgl2: true, ...readGl(ctx), ...base }
      : { webgl2: false, maxTextureSize: null, renderer: null, ...base }
  } catch {
    cached = { webgl2: false, maxTextureSize: null, renderer: null, ...base }
  }
  return cached
}

/** Pure: what the device can carry. `off` = no WebGL2, the 2D screens only. */
export function qualityFor(c: Capabilities): Quality {
  if (!c.webgl2) return 'off'
  if ((c.maxTextureSize !== null && c.maxTextureSize < 4096) || (c.deviceMemoryGb !== null && c.deviceMemoryGb < 4)) {
    return 'low'
  }
  if ((c.deviceMemoryGb !== null && c.deviceMemoryGb < 8) || (c.cores !== null && c.cores <= 4)) {
    return 'medium'
  }
  return 'high'
}

/** The user's choice wins, except that nothing turns WebGL on where there is none. */
export function effectiveQuality(choice: QualityChoice, c: Capabilities): Quality {
  if (!c.webgl2) return 'off'
  return choice === 'auto' ? qualityFor(c) : choice
}

export interface QualitySettings {
  /** Upper bound for the device pixel ratio. */
  maxDpr: number
  /** Canvas `shadows`: soft (PCF soft), basic, or none. */
  shadows: 'soft' | 'basic' | 'none'
  /** Adaptive resolution (drei PerformanceMonitor). */
  adaptive: boolean
}

export function qualitySettings(q: Exclude<Quality, 'off'>): QualitySettings {
  switch (q) {
    case 'high':
      return { maxDpr: 2, shadows: 'soft', adaptive: true }
    case 'medium':
      return { maxDpr: 1.25, shadows: 'basic', adaptive: true }
    case 'low':
      return { maxDpr: 1, shadows: 'none', adaptive: false }
  }
}

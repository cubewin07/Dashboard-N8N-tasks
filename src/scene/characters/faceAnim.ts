import faceAtlasJson from '@/content/catalog/face-atlas.json'

export type EyeState = 'open' | 'half' | 'closed' | 'happy'

export interface FaceAtlasConfig {
  size: number
  grid: number
  defaults: {
    eyes: readonly [number, number]
    brows: readonly [number, number]
    mouth: readonly [number, number]
  }
  eyeStates: Record<EyeState, number>
  cells: Record<string, readonly [number, number]>
}

function toCellPair(v: readonly number[]): readonly [number, number] {
  return [v[0] ?? 0, v[1] ?? 0]
}

export const DEFAULT_FACE_ATLAS: FaceAtlasConfig = {
  size: faceAtlasJson.size,
  grid: faceAtlasJson.grid,
  defaults: {
    eyes: toCellPair(faceAtlasJson.defaults.eyes),
    brows: toCellPair(faceAtlasJson.defaults.brows),
    mouth: toCellPair(faceAtlasJson.defaults.mouth),
  },
  eyeStates: {
    open: faceAtlasJson.eyeStates.open,
    half: faceAtlasJson.eyeStates.half,
    closed: faceAtlasJson.eyeStates.closed,
    happy: faceAtlasJson.eyeStates.happy,
  },
  cells: Object.fromEntries(
    Object.entries(faceAtlasJson.cells).map(([k, v]) => [k, toCellPair(v)]),
  ),
}

export interface UvAttributeLike {
  readonly count: number
  getX(index: number): number
  getY(index: number): number
  setXY(index: number, x: number, y: number): unknown
  needsUpdate: boolean
}

export interface ColorAttributeLike {
  readonly count: number
  getX(index: number): number
  getY(index: number): number
  getZ(index: number): number
}

export interface FaceRegionSlot {
  readonly indices: Uint32Array
  /** Local UV offsets relative to the slot's default cell origin `(col / grid, row / grid)`. */
  readonly baseOffsetUv: Float32Array
  readonly defaultCell: readonly [number, number]
}

export interface FaceRegions {
  readonly grid: number
  readonly atlas: FaceAtlasConfig
  readonly eyes: FaceRegionSlot
  readonly brows: FaceRegionSlot
  readonly mouth: FaceRegionSlot
  readonly selected: {
    eyes: string
    brows: string
    mouth: string
    eyeState: EyeState
  }
}

export interface FaceCellState {
  eyes?: string
  brows?: string
  mouth?: string
  eyeState?: EyeState
}

export interface CreateFaceRegionsOptions {
  startVertex?: number
  vertexCount?: number
  atlas?: FaceAtlasConfig
  eyes?: string
  brows?: string
  mouth?: string
}

/**
 * Index the eye, brow, and mouth vertices inside a merged (or standalone)
 * geometry using the `M_Face` channel-mask convention `(1,0,0) / (0,1,0) / (0,0,1)`.
 */
export function createFaceRegions(
  uvAttr: UvAttributeLike,
  colorAttr: ColorAttributeLike,
  options: CreateFaceRegionsOptions = {},
): FaceRegions {
  const atlas = options.atlas ?? DEFAULT_FACE_ATLAS
  const grid = atlas.grid
  const start = options.startVertex ?? 0
  const count = options.vertexCount ?? Math.max(0, uvAttr.count - start)
  const colorBase = colorAttr.count < start + count ? 0 : start

  const eyeIdx: number[] = []
  const browIdx: number[] = []
  const mouthIdx: number[] = []

  for (let k = 0; k < count; k += 1) {
    const vi = start + k
    const ci = colorBase + k
    if (vi >= uvAttr.count || ci >= colorAttr.count) break
    const r = colorAttr.getX(ci)
    const g = colorAttr.getY(ci)
    const b = colorAttr.getZ(ci)
    if (r >= g && r >= b && r > 0.5) {
      eyeIdx.push(vi)
    } else if (g >= r && g >= b && g > 0.5) {
      browIdx.push(vi)
    } else if (b >= r && b >= g && b > 0.5) {
      mouthIdx.push(vi)
    }
  }

  const buildSlot = (
    indicesList: number[],
    defaultCell: readonly [number, number],
  ): FaceRegionSlot => {
    const indices = new Uint32Array(indicesList)
    const baseOffsetUv = new Float32Array(indices.length * 2)
    const originU = defaultCell[0] / grid
    const originV = defaultCell[1] / grid
    for (let i = 0; i < indices.length; i += 1) {
      const vi = indices[i]!
      baseOffsetUv[i * 2] = uvAttr.getX(vi) - originU
      baseOffsetUv[i * 2 + 1] = uvAttr.getY(vi) - originV
    }
    return { indices, baseOffsetUv, defaultCell }
  }

  return {
    grid,
    atlas,
    eyes: buildSlot(eyeIdx, atlas.defaults.eyes),
    brows: buildSlot(browIdx, atlas.defaults.brows),
    mouth: buildSlot(mouthIdx, atlas.defaults.mouth),
    selected: {
      eyes: options.eyes ?? 'eyes_01',
      brows: options.brows ?? 'brows_01',
      mouth: options.mouth ?? 'mouth_01',
      eyeState: 'open',
    },
  }
}

function writeSlotCell(
  uvAttr: UvAttributeLike,
  slot: FaceRegionSlot,
  cell: readonly [number, number],
  grid: number,
  colOffset = 0,
): void {
  const uOrigin = (cell[0] + colOffset) / grid
  const vOrigin = cell[1] / grid
  const { indices, baseOffsetUv } = slot
  for (let i = 0; i < indices.length; i += 1) {
    const vi = indices[i]!
    uvAttr.setXY(vi, uOrigin + baseOffsetUv[i * 2]!, vOrigin + baseOffsetUv[i * 2 + 1]!)
  }
}

/**
 * Rewrite ONLY the face vertices' UVs in-place to display the requested
 * eye style/state, brows, and mouth from `face-atlas.json`.
 */
export function applyFaceCells(
  uvAttr: UvAttributeLike,
  regions: FaceRegions,
  state: FaceCellState | EyeState,
): void {
  const patch: FaceCellState = typeof state === 'string' ? { eyeState: state } : state
  const { atlas, grid, selected } = regions

  if (patch.eyes !== undefined || patch.eyeState !== undefined) {
    const eyeStyle = patch.eyes ?? selected.eyes
    const eyeState = patch.eyeState ?? selected.eyeState
    selected.eyes = eyeStyle
    selected.eyeState = eyeState
    const baseCell = atlas.cells[eyeStyle] ?? atlas.defaults.eyes
    const colOffset = atlas.eyeStates[eyeState] ?? 0
    writeSlotCell(uvAttr, regions.eyes, baseCell, grid, colOffset)
  }

  if (patch.brows !== undefined) {
    selected.brows = patch.brows
    const cell = atlas.cells[patch.brows] ?? atlas.defaults.brows
    writeSlotCell(uvAttr, regions.brows, cell, grid, 0)
  }

  if (patch.mouth !== undefined) {
    selected.mouth = patch.mouth
    const cell = atlas.cells[patch.mouth] ?? atlas.defaults.mouth
    writeSlotCell(uvAttr, regions.mouth, cell, grid, 0)
  }

  uvAttr.needsUpdate = true
}

export const BLINK_MIN_INTERVAL_S = 3.0
export const BLINK_MAX_INTERVAL_S = 6.0

const HALF_PHASE_S = 0.04
const CLOSED_PHASE_S = 0.08

export type BlinkPhase = 'open' | 'closing_half' | 'closed' | 'opening_half'

export interface BlinkState {
  phase: BlinkPhase
  timeLeft: number
  current: EyeState
  rngState: number
}

function hashSeed(seed: string | number): number {
  if (typeof seed === 'number') {
    const n = (seed | 0) ^ 0x9e3779b9
    return n === 0 ? 0x6d2b79f5 : n >>> 0
  }
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h >>>= 0
  return h === 0 ? 0x6d2b79f5 : h
}

function nextRandom(state: BlinkState, rng?: () => number): number {
  if (rng) return Math.min(0.999999, Math.max(0, rng()))
  // Mulberry32 deterministic step
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function sampleInterval(state: BlinkState, rng?: () => number): number {
  const u = nextRandom(state, rng)
  return BLINK_MIN_INTERVAL_S + u * (BLINK_MAX_INTERVAL_S - BLINK_MIN_INTERVAL_S)
}

function phaseToEyeState(phase: BlinkPhase): EyeState {
  if (phase === 'closed') return 'closed'
  if (phase === 'closing_half' || phase === 'opening_half') return 'half'
  return 'open'
}

/** Create deterministic per-character blink state with interval in [3.0, 6.0] s. */
export function createBlinkState(seed: string | number, rng?: () => number): BlinkState {
  const state: BlinkState = {
    phase: 'open',
    timeLeft: BLINK_MIN_INTERVAL_S,
    current: 'open',
    rngState: hashSeed(seed),
  }
  state.timeLeft = sampleInterval(state, rng)
  return state
}

export interface StepBlinkOptions {
  eyesOverride?: EyeState
  rng?: () => number
}

/**
 * Advance the blink state machine by `dt` seconds and return the active `EyeState`.
 * `eyesOverride === 'closed'` (sleep clips) or `'happy'` (celebrate) forces that cell.
 */
export function stepBlink(
  state: BlinkState,
  dt: number,
  opts: StepBlinkOptions = {},
): EyeState {
  const { eyesOverride, rng } = opts
  if (eyesOverride === 'closed' || eyesOverride === 'happy') {
    state.phase = 'open'
    state.current = eyesOverride
    return eyesOverride
  }

  let remaining = Math.max(0, dt)
  while (remaining > 0) {
    if (remaining < state.timeLeft) {
      state.timeLeft -= remaining
      break
    }
    remaining -= state.timeLeft
    switch (state.phase) {
      case 'open':
        state.phase = 'closing_half'
        state.timeLeft = HALF_PHASE_S
        break
      case 'closing_half':
        state.phase = 'closed'
        state.timeLeft = CLOSED_PHASE_S
        break
      case 'closed':
        state.phase = 'opening_half'
        state.timeLeft = HALF_PHASE_S
        break
      case 'opening_half':
        state.phase = 'open'
        state.timeLeft = sampleInterval(state, rng)
        break
    }
  }

  state.current = phaseToEyeState(state.phase)
  return state.current
}

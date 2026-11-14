export type CharacterMixerRate = 0 | 5 | 15 | 30

export interface CharacterLodInput {
  /** Camera distance to the character (metres). */
  distance: number
  /** Floor/character opacity; <= 0.01 is treated as hidden (0 Hz). */
  opacity?: number
  /** Whether the character is inside the camera frustum (defaults to true). */
  inFrustum?: boolean
  /** Whether the character is visible at all (defaults to true). */
  visible?: boolean
  /** Whether the character is on the currently focused floor (defaults to true when not in floor-focus mode). */
  onFocusedFloor?: boolean
  /** Followed by the camera (always 30 Hz when visible). */
  followed?: boolean
  /** Selected in the UI (always 30 Hz when visible). */
  selected?: boolean
}

export interface LodSlotState {
  phase01: number
  dueIn: number
  pendingDt: number
  lastRate: CharacterMixerRate
}

export interface LodStepResult {
  shouldUpdate: boolean
  stepDt: number
  rate: CharacterMixerRate
  visible: boolean
}

const NEAR_DISTANCE_MAX = 25
const MID_DISTANCE_MAX = 60
const HIDDEN_OPACITY = 0.01
const GOLDEN_RATIO_CONJUGATE = 0.618033988749895

/**
 * Determine the animation mixer update rate (Hz) for a character per §3.6:
 * - 0 Hz (`visible = false`): floor hidden (`opacity <= 0.01`), `visible === false`, or outside frustum
 * - 30 Hz: followed, selected, or visible on focused floor within 25 m
 * - 15 Hz: visible 25–60 m (or within 25 m on non-focused floor)
 * - 5 Hz: visible > 60 m
 */
export function characterMixerRate(opts: CharacterLodInput): CharacterMixerRate {
  if (opts.visible === false) return 0
  if (opts.inFrustum === false) return 0
  if (opts.opacity !== undefined && opts.opacity <= HIDDEN_OPACITY) return 0

  if (opts.followed || opts.selected) return 30
  if (!Number.isFinite(opts.distance)) return 5

  if (opts.distance <= NEAR_DISTANCE_MAX) {
    return opts.onFocusedFloor === false ? 15 : 30
  }
  if (opts.distance <= MID_DISTANCE_MAX) return 15
  return 5
}

function normalizePhase(phase01: number): number {
  if (!Number.isFinite(phase01)) return 0
  const mod = phase01 % 1
  return mod < 0 ? mod + 1 : mod
}

export function createLodSlot(phase01 = 0): LodSlotState {
  return {
    phase01: normalizePhase(phase01),
    dueIn: 0,
    pendingDt: 0,
    lastRate: 0,
  }
}

/**
 * Advance one character's staggered LOD slot by `dt` seconds.
 * When `shouldUpdate` is true, `stepDt` contains all accumulated seconds since
 * the previous mixer update so animation speed remains 1x real-time.
 */
export function stepLodSlot(
  slot: LodSlotState,
  rate: CharacterMixerRate,
  dt: number,
): LodStepResult {
  if (rate === 0) {
    slot.pendingDt = 0
    slot.lastRate = 0
    return { shouldUpdate: false, stepDt: 0, rate: 0, visible: false }
  }

  const interval = 1 / rate
  if (slot.lastRate !== rate) {
    if (slot.lastRate === 0 || slot.dueIn > interval) {
      const phase = slot.phase01 > 0 ? slot.phase01 : 1
      slot.dueIn = phase * interval
    }
    slot.lastRate = rate
  }

  if (!(dt > 0)) {
    return { shouldUpdate: false, stepDt: 0, rate, visible: true }
  }

  slot.pendingDt += dt
  slot.dueIn -= dt

  if (slot.dueIn <= 1e-9) {
    const stepDt = slot.pendingDt
    slot.pendingDt = 0
    slot.dueIn += interval
    if (slot.dueIn <= 0) {
      slot.dueIn = ((slot.dueIn % interval) + interval) % interval
      if (slot.dueIn <= 1e-9) slot.dueIn = interval
    }
    return { shouldUpdate: true, stepDt, rate, visible: true }
  }

  return { shouldUpdate: false, stepDt: 0, rate, visible: true }
}

/**
 * Tracks per-character staggered mixer slots and frame update counters.
 */
export class CharacterLodScheduler {
  private readonly slots = new Map<string, LodSlotState>()
  private nextSlotIndex = 0
  private frameUpdates = 0
  private totalUpdates = 0

  /** Call once at the start of each frame to reset per-frame telemetry. */
  beginFrame(): void {
    this.frameUpdates = 0
  }

  step(id: string, input: CharacterLodInput, dt: number): LodStepResult {
    let slot = this.slots.get(id)
    if (!slot) {
      const phase01 = (this.nextSlotIndex * GOLDEN_RATIO_CONJUGATE) % 1
      this.nextSlotIndex += 1
      slot = createLodSlot(phase01)
      this.slots.set(id, slot)
    }

    const rate = characterMixerRate(input)
    const result = stepLodSlot(slot, rate, dt)
    if (result.shouldUpdate) {
      this.frameUpdates += 1
      this.totalUpdates += 1
    }
    return result
  }

  rateOf(id: string): CharacterMixerRate {
    return this.slots.get(id)?.lastRate ?? 0
  }

  get updatesThisFrame(): number {
    return this.frameUpdates
  }

  get totalMixerUpdates(): number {
    return this.totalUpdates
  }

  get size(): number {
    return this.slots.size
  }

  delete(id: string): boolean {
    return this.slots.delete(id)
  }

  reset(): void {
    this.slots.clear()
    this.nextSlotIndex = 0
    this.frameUpdates = 0
    this.totalUpdates = 0
  }
}

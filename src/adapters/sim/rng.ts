import { newId, type UlidFactory } from '@/domain/ids'
import type { Id, IdPrefix } from '@/domain/primitives'

export type RandomFn = () => number

const CROCKFORD_32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function hashSeed(seed: string | number): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed >>> 0 || 1
  }
  const str = String(seed)
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0 || 1
}

export function mulberry32(seed: string | number): RandomFn {
  let state = hashSeed(seed)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(rng: RandomFn, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('Cannot pick from an empty array')
  }
  const idx = Math.floor(rng() * items.length)
  return items[Math.min(idx, items.length - 1)]!
}

export interface WeightedItem<T> {
  item: T
  weight: number
}

export function weighted<T>(
  rng: RandomFn,
  items: readonly WeightedItem<T>[],
): T {
  if (items.length === 0) {
    throw new Error('Cannot pick weighted from an empty array')
  }
  let total = 0
  for (const entry of items) {
    if (entry.weight > 0) {
      total += entry.weight
    }
  }
  if (total <= 0) {
    return items[0]!.item
  }
  let r = rng() * total
  for (const entry of items) {
    if (entry.weight <= 0) continue
    if (r < entry.weight) {
      return entry.item
    }
    r -= entry.weight
  }
  return items[items.length - 1]!.item
}

export function range(rng: RandomFn, min: number, max: number): number {
  if (max <= min) return min
  return min + rng() * (max - min)
}

export function intRange(rng: RandomFn, min: number, max: number): number {
  if (max <= min) return Math.floor(min)
  const low = Math.ceil(min)
  const high = Math.floor(max)
  return low + Math.floor(rng() * (high - low + 1))
}

export function chance(rng: RandomFn, probability: number): boolean {
  if (probability <= 0) return false
  if (probability >= 1) return true
  return rng() < probability
}

export function simUlid(rng: RandomFn, simTimeMs: number): string {
  // 10 chars timestamp (48-bit ms) + 16 chars randomness
  let time = Math.max(0, Math.floor(simTimeMs))
  const timeChars = new Array<string>(10)
  for (let i = 9; i >= 0; i -= 1) {
    const mod = time % 32
    timeChars[i] = CROCKFORD_32[mod]!
    time = Math.floor(time / 32)
  }

  let randPart = ''
  for (let i = 0; i < 16; i += 1) {
    const idx = Math.floor(rng() * 32)
    randPart += CROCKFORD_32[Math.min(idx, 31)]!
  }

  return timeChars.join('') + randPart
}

export function createSimUlidFactory(
  rng: RandomFn,
  getSimTimeMs: () => number,
): UlidFactory {
  return () => simUlid(rng, getSimTimeMs())
}

export function simId<P extends IdPrefix>(
  prefix: P,
  rng: RandomFn,
  simTimeMs: number,
): Id<P> {
  return newId(prefix, () => simUlid(rng, simTimeMs))
}

import type { Id, IdPrefix } from './primitives'

export type UlidFactory = () => string

/**
 * The domain holds no clock, randomness or counter, so the caller supplies
 * the ULID source: the simulator uses its seeded rng, the UI `wallUlid`.
 */
export function newId<P extends IdPrefix>(
  prefix: P,
  ulidFactory: UlidFactory,
): Id<P> {
  const ulid = ulidFactory()
  if (typeof ulid !== 'string' || ulid.trim().length === 0) {
    throw new Error(`Invalid ULID generated for prefix "${prefix}"`)
  }
  return `${prefix}_${ulid}`
}

export function isIdOf<P extends IdPrefix>(value: string, prefix: P): value is Id<P> {
  return value.startsWith(`${prefix}_`) && value.length > prefix.length + 1
}

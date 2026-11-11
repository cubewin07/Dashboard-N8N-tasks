import type { Id, IdPrefix } from './primitives'

export type UlidFactory = () => string

let fallbackSeq = 0
function defaultUlidFactory(): string {
  fallbackSeq += 1
  return `01JCMD${String(fallbackSeq).padStart(20, '0')}`
}

export function newId<P extends IdPrefix>(
  prefix: P,
  ulidFactory: UlidFactory = defaultUlidFactory,
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

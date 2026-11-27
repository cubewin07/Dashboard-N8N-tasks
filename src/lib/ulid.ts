const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * A real ULID: 48-bit wall-clock time + 80 bits of crypto randomness.
 * For ids the browser mints (command ids); unique across page loads, unlike
 * a counter. Not for the domain or simulator, which must stay deterministic.
 */
export function wallUlid(nowMs: number = Date.now()): string {
  let time = ''
  let t = Math.floor(nowMs)
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time
    t = Math.floor(t / 32)
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let random = ''
  for (let i = 0; i < 16; i++) {
    random += CROCKFORD[bytes[i]! % 32]
  }
  return time + random
}

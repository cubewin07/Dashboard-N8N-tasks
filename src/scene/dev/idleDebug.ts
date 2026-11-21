/**
 * Dev only: `?debug=idle` on the office (`#/?debug=idle`; the phase text
 * says `#/office`) opens the idle gallery (P05-T10). The gallery lives on the
 * existing dev pose page, so the office just forwards there (smaller than a
 * second canvas in the office).
 */
export const IDLE_GALLERY_HASH = '#/dev/people?gallery=idle'

export function isIdleDebugHash(hash: string): boolean {
  const q = hash.indexOf('?')
  if (q < 0) return false
  const path = hash.slice(1, q)
  if (path !== '/' && path !== '' && path !== '/office') return false
  return new URLSearchParams(hash.slice(q + 1)).get('debug') === 'idle'
}

export function redirectIdleDebug(): void {
  if (typeof window === 'undefined') return
  if (isIdleDebugHash(window.location.hash)) window.location.replace(IDLE_GALLERY_HASH)
}

/** Redirect now and whenever the hash is edited by hand; returns the cleanup. */
export function watchIdleDebug(): () => void {
  if (typeof window === 'undefined') return () => {}
  redirectIdleDebug()
  window.addEventListener('hashchange', redirectIdleDebug)
  return () => window.removeEventListener('hashchange', redirectIdleDebug)
}

import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 639px)'

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}

function snapshot(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches
}

/** True under 640 px: lists switch from tables to cards. Falls back to desktop where matchMedia is missing. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}

import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import type { EmployeeId } from '@/domain/primitives'
import { usePeopleUi } from '@/office/uiStore'
import { usePeopleDirectory } from './usePeopleDirectory'

export const FOLLOW_PARAM = 'follow'

/**
 * The search string as the browser has it right now. Another effect may have
 * navigated in the same tick (the view store writes `cam`/`floor`), and the
 * router's `location` only catches up on the next render. Under HashRouter
 * the real URL is ahead of it; elsewhere (tests, memory router) the router's
 * own value is used.
 */
function currentSearch(pathname: string, fallback: string): URLSearchParams {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash
    const raw = hash.startsWith('#') ? hash.slice(1) : ''
    const queryAt = raw.indexOf('?')
    const path = queryAt >= 0 ? raw.slice(0, queryAt) : raw
    if (path === pathname) {
      return new URLSearchParams(queryAt >= 0 ? raw.slice(queryAt + 1) : '')
    }
  }
  return new URLSearchParams(fallback)
}

/**
 * Keeps `?follow=emp_id` and `usePeopleUi().followedId` in sync both ways.
 *
 * - URL → store on load and on back/forward.
 * - store → URL with `replace`, touching only the `follow` key.
 * - Ids that are not active employees are dropped (from the URL and the store)
 *   once the config is known; until then a URL id simply waits.
 *
 * Whichever side changed since the two last agreed wins. Writes are deferred
 * by one task so they never race another navigation started in the same tick.
 */
export function useFollowUrlSync(): void {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlFollow = searchParams.get(FOLLOW_PARAM)
  const followedId = usePeopleUi((s) => s.followedId)
  const directory = usePeopleDirectory()

  const activeIds = useMemo(
    () =>
      directory
        ? new Set<string>(directory.flatMap((g) => g.people.map((p) => p.id)))
        : null,
    [directory],
  )

  /** The value both sides last agreed on. */
  const agreedRef = useRef<string | null>(null)

  useEffect(() => {
    const ui = usePeopleUi.getState()
    let store: string | null = ui.followedId

    // A followed person who was archived or removed stops being followed.
    if (store !== null && activeIds && !activeIds.has(store)) {
      ui.follow(null)
      store = null
    }

    if (urlFollow === store) {
      agreedRef.current = store
      return
    }

    let next: string | null
    if (store !== agreedRef.current) {
      // The store moved (list, drawer, 3D click, Esc): write it to the URL.
      next = store
    } else {
      // The URL moved (first load, back/forward, pasted link).
      if (urlFollow !== null && !activeIds) return // wait for the config
      if (urlFollow !== null && activeIds?.has(urlFollow)) {
        ui.follow(urlFollow as EmployeeId)
        agreedRef.current = urlFollow
        return
      }
      if (urlFollow === null) {
        ui.follow(null)
        agreedRef.current = null
        return
      }
      next = null // unknown id: strip it
    }

    const timer = window.setTimeout(() => {
      const params = currentSearch(location.pathname, location.search)
      if ((params.get(FOLLOW_PARAM) ?? null) === next) return
      if (next === null) params.delete(FOLLOW_PARAM)
      else params.set(FOLLOW_PARAM, next)
      setSearchParams(params, { replace: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    urlFollow,
    followedId,
    activeIds,
    location.pathname,
    location.search,
    setSearchParams,
  ])
}

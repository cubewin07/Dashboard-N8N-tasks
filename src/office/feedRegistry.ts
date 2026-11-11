import type { ComponentType } from 'react'
import { StaticFeed } from '@/adapters/local/StaticFeed'
import { ReplayFeed } from '@/adapters/replay/ReplayFeed'
import * as simAdapter from '@/adapters/sim'
import type { OfficeFeed } from '@/ports/OfficeFeed'
import { officeExtensions, type SimControlsDebugApi } from './extensions'

export type FeedKind = 'static' | 'sim' | 'replay' | 'none'

export function getUrlParam(name: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const hash = window.location.hash || ''
    const qIdx = hash.indexOf('?')
    if (qIdx >= 0) {
      const hashParams = new URLSearchParams(hash.slice(qIdx + 1))
      const val = hashParams.get(name)
      if (val !== null && val.trim().length > 0) return val.trim()
    }
    const searchParams = new URLSearchParams(window.location.search)
    const val = searchParams.get(name)
    if (val !== null && val.trim().length > 0) return val.trim()
  } catch {
    // Ignore URL errors in headless/test environments
  }
  return null
}

interface SimModuleExports {
  SimFeed?: new (options?: { seed?: string | number }) => OfficeFeed
  simControls?: SimControlsDebugApi
  SimControlPanel?: ComponentType
}

export function createFeed(kind?: FeedKind): OfficeFeed {
  const urlFeed = getUrlParam('feed')
  const envFeed = import.meta.env.VITE_FEED as string | undefined
  const resolved: string = kind ?? urlFeed ?? envFeed ?? 'sim'

  if (resolved === 'replay') {
    officeExtensions.controlPanel = null
    officeExtensions.simControls = null
    const logUrl = getUrlParam('log') ?? undefined
    return new ReplayFeed({ logUrl })
  }

  if (resolved === 'sim') {
    const mod = simAdapter as unknown as SimModuleExports
    if (typeof mod.SimFeed === 'function') {
      officeExtensions.controlPanel = mod.SimControlPanel ?? null
      officeExtensions.simControls = mod.simControls ?? null
      const seed = getUrlParam('seed') ?? undefined
      return new mod.SimFeed(seed ? { seed } : undefined)
    }
  }

  officeExtensions.controlPanel = null
  officeExtensions.simControls = null
  return new StaticFeed()
}

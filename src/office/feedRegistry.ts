import { StaticFeed } from '@/adapters/local/StaticFeed'
import type { OfficeFeed } from '@/ports/OfficeFeed'

export type FeedKind = 'static' | 'sim' | 'replay' | 'none'

export function createFeed(kind?: FeedKind): OfficeFeed {
  const resolved: string =
    kind ?? ((import.meta.env.VITE_FEED as string | undefined) || 'static')
  switch (resolved) {
    case 'static':
    default:
      return new StaticFeed()
  }
}

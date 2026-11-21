import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { sameOriginLogUrl } from '@/office/feedRegistry'
import { createReplayFeed } from '../ReplayFeed'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ReplayFeed with a log URL', () => {
  it('fails clearly on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    const feed = createReplayFeed({ logUrl: '/replay/missing.json', autoStartTimer: false })
    await expect(feed.start(makeSeedConfig())).rejects.toThrow(/HTTP 404/)
  })

  it('fails clearly when the body is not JSON or has no events', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })))
    const feed = createReplayFeed({ logUrl: '/replay/x.json', autoStartTimer: false })
    await expect(feed.start(makeSeedConfig())).rejects.toThrow(/not valid JSON/)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"seed":1}', { status: 200 })))
    await expect(
      createReplayFeed({ logUrl: '/replay/y.json', autoStartTimer: false }).start(makeSeedConfig()),
    ).rejects.toThrow(/no events/)
  })
})

describe('sameOriginLogUrl', () => {
  it('only allows logs from the app origin', () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://app.example', href: 'https://app.example/Dashboard-N8N-tasks/' },
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(sameOriginLogUrl(null)).toBeUndefined()
    expect(sameOriginLogUrl('replay/day.json')).toBe('https://app.example/Dashboard-N8N-tasks/replay/day.json')
    expect(sameOriginLogUrl('https://evil.example/log.json')).toBeUndefined()
  })
})

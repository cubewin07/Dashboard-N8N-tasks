import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getEmitCount, resetEmitCount, stopSimulator } from '@/lib/mock/store'
import { LegacyBoundary } from '../LegacyBoundary'
import { RealtimeProvider } from '../RealtimeProvider'

describe('LegacyBoundary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stopSimulator()
    resetEmitCount()
  })

  afterEach(() => {
    stopSimulator()
    vi.useRealTimers()
  })

  it('produces zero legacy store emits outside LegacyBoundary over 30s, and runs only while mounted', () => {
    const qc = new QueryClient()
    const nonLegacy = render(
      <QueryClientProvider client={qc}>
        <RealtimeProvider>
          <div>Org Page</div>
        </RealtimeProvider>
      </QueryClientProvider>,
    )

    vi.advanceTimersByTime(30_000)
    expect(getEmitCount()).toBe(0)
    nonLegacy.unmount()

    const legacy = render(
      <QueryClientProvider client={qc}>
        <RealtimeProvider>
          <LegacyBoundary>
            <div>Legacy Overview</div>
          </LegacyBoundary>
        </RealtimeProvider>
      </QueryClientProvider>,
    )

    vi.advanceTimersByTime(30_000)
    const countWhileMounted = getEmitCount()
    expect(countWhileMounted).toBeGreaterThan(0)

    legacy.unmount()
    resetEmitCount()

    vi.advanceTimersByTime(30_000)
    expect(getEmitCount()).toBe(0)
  })
})

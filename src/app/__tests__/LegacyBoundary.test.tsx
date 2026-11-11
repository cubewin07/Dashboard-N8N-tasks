import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActivityPage } from '@/features/activity/ActivityPage'
import { OfficePage } from '@/features/office/OfficePage'
import { I18nProvider } from '@/i18n'
import * as mockStore from '@/lib/mock/store'
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

  it('never calls startSimulator when rendering non-legacy routes (OfficePage / ActivityPage)', () => {
    const startSimSpy = vi.spyOn(mockStore, 'startSimulator')
    const qc = new QueryClient()

    const nonLegacyOffice = render(
      <QueryClientProvider client={qc}>
        <RealtimeProvider>
          <I18nProvider>
            <MemoryRouter initialEntries={['/']}>
              <OfficePage />
            </MemoryRouter>
          </I18nProvider>
        </RealtimeProvider>
      </QueryClientProvider>,
    )
    vi.advanceTimersByTime(30_000)
    expect(startSimSpy).not.toHaveBeenCalled()
    expect(getEmitCount()).toBe(0)
    nonLegacyOffice.unmount()

    const nonLegacyActivity = render(
      <QueryClientProvider client={qc}>
        <RealtimeProvider>
          <I18nProvider>
            <MemoryRouter initialEntries={['/activity']}>
              <ActivityPage />
            </MemoryRouter>
          </I18nProvider>
        </RealtimeProvider>
      </QueryClientProvider>,
    )
    vi.advanceTimersByTime(30_000)
    expect(startSimSpy).not.toHaveBeenCalled()
    expect(getEmitCount()).toBe(0)
    nonLegacyActivity.unmount()
  })
})

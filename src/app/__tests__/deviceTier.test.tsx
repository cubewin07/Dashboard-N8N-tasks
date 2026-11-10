import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEVICE_TIER_STORAGE_KEY,
  detectTier,
  setDeviceTierOverride,
  useDeviceTier,
  useDeviceTierPreference,
} from '../deviceTier'

describe('deviceTier (R13)', () => {
  let isMobileViewport = false
  let webgl2Available = true

  beforeEach(() => {
    localStorage.removeItem(DEVICE_TIER_STORAGE_KEY)
    isMobileViewport = false
    webgl2Available = true

    vi.stubGlobal('WebGL2RenderingContext', class {})
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) =>
        ({
          matches: query.includes('768px') ? isMobileViewport : false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    })

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((
      contextId: string,
    ) => {
      if (contextId === 'webgl2') {
        return webgl2Available ? ({} as WebGL2RenderingContext) : null
      }
      return null
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext)
  })

  afterEach(() => {
    localStorage.removeItem(DEVICE_TIER_STORAGE_KEY)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns full3d on desktop with WebGL2 available', () => {
    expect(detectTier()).toBe('full3d')
  })

  it('returns fallback when viewport <= 768px', () => {
    isMobileViewport = true
    expect(detectTier()).toBe('fallback')
  })

  it('returns fallback when WebGL2 context is unavailable', () => {
    webgl2Available = false
    expect(detectTier()).toBe('fallback')
  })

  it('honours localStorage override over viewport and WebGL2 checks, and updates hook on resize/override', () => {
    isMobileViewport = true
    webgl2Available = false

    const { result } = renderHook(() => useDeviceTier())
    expect(result.current).toBe('fallback')

    act(() => {
      setDeviceTierOverride('full3d')
    })
    expect(localStorage.getItem(DEVICE_TIER_STORAGE_KEY)).toBe('full3d')
    expect(result.current).toBe('full3d')

    const pref = renderHook(() => useDeviceTierPreference())
    expect(pref.result.current.override).toBe('full3d')

    act(() => {
      pref.result.current.setOverride('auto')
    })
    expect(localStorage.getItem(DEVICE_TIER_STORAGE_KEY)).toBeNull()
    expect(result.current).toBe('fallback')

    isMobileViewport = false
    webgl2Available = true
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe('full3d')
  })
})

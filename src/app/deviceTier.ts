import { useEffect, useState } from 'react'
import { probeCapabilities, resetCapabilitiesProbe } from '@/office/capabilities'

export const DEVICE_TIER_STORAGE_KEY = 'office.deviceTier'

export type DeviceTier = 'full3d' | 'fallback'
export type DeviceTierOverride = DeviceTier | 'auto'

const listeners = new Set<() => void>()

function notifyListeners() {
  listeners.forEach((fn) => fn())
}

export function getDeviceTierOverride(): DeviceTierOverride {
  try {
    if (typeof localStorage === 'undefined') return 'auto'
    const raw = localStorage.getItem(DEVICE_TIER_STORAGE_KEY)
    if (raw === 'full3d' || raw === 'fallback') return raw
    return 'auto'
  } catch {
    return 'auto'
  }
}

export function setDeviceTierOverride(override: DeviceTierOverride): void {
  try {
    if (typeof localStorage !== 'undefined') {
      if (override === 'auto') {
        localStorage.removeItem(DEVICE_TIER_STORAGE_KEY)
      } else {
        localStorage.setItem(DEVICE_TIER_STORAGE_KEY, override)
      }
    }
  } catch {
    /* ignore storage errors */
  }
  notifyListeners()
}

/** Forget the cached capability probe (tests only). */
export function resetWebGL2Probe(): void {
  resetCapabilitiesProbe()
}

/** Probed once per page (see `probeCapabilities`). */
export function hasWebGL2Support(): boolean {
  return probeCapabilities().webgl2
}

export function detectTier(): DeviceTier {
  // R8: without WebGL2 the 2D screens are the only option, whatever was stored.
  if (!hasWebGL2Support()) return 'fallback'
  const override = getDeviceTierOverride()
  if (override === 'full3d' || override === 'fallback') {
    return override
  }
  if (typeof window === 'undefined') {
    return 'fallback'
  }
  try {
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 768px)').matches
    ) {
      return 'fallback'
    }
  } catch {
    /* ignore matchMedia error */
  }
  return 'full3d'
}

export function useDeviceTier(): DeviceTier {
  const [tier, setTier] = useState<DeviceTier>(() => detectTier())

  useEffect(() => {
    const update = () => {
      setTier(detectTier())
    }
    update()

    listeners.add(update)
    window.addEventListener('resize', update)

    let mql: MediaQueryList | null = null
    try {
      if (typeof window.matchMedia === 'function') {
        mql = window.matchMedia('(max-width: 768px)')
        mql.addEventListener?.('change', update)
      }
    } catch {
      mql = null
    }

    return () => {
      listeners.delete(update)
      window.removeEventListener('resize', update)
      mql?.removeEventListener?.('change', update)
    }
  }, [])

  return tier
}

export function useDeviceTierPreference() {
  const tier = useDeviceTier()
  const [override, setOverrideState] = useState<DeviceTierOverride>(() =>
    getDeviceTierOverride(),
  )

  useEffect(() => {
    const sync = () => {
      setOverrideState(getDeviceTierOverride())
    }
    listeners.add(sync)
    return () => {
      listeners.delete(sync)
    }
  }, [])

  return {
    tier,
    override,
    setOverride: (next: DeviceTierOverride) => {
      setDeviceTierOverride(next)
    },
  }
}

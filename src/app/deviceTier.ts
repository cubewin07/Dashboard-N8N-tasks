import { useEffect, useState } from 'react'

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

export function hasWebGL2Support(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false
  }
  if (typeof window.WebGL2RenderingContext === 'undefined') {
    return false
  }
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('webgl2')
    return Boolean(ctx)
  } catch {
    return false
  }
}

export function detectTier(): DeviceTier {
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
  if (!hasWebGL2Support()) {
    return 'fallback'
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

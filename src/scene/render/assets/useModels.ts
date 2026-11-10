import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  getLoadProgress,
  getManifest,
  getModelsVersion,
  loadManifest,
  subscribeModels,
  type LoadProgress,
} from './modelStore'

/** Re-renders whenever the manifest or any model finishes loading. */
export function useModelsVersion(): number {
  return useSyncExternalStore(subscribeModels, getModelsVersion, getModelsVersion)
}

export function useAssetManifest() {
  const version = useModelsVersion()
  useEffect(() => {
    void loadManifest()
  }, [])
  void version
  return getManifest()
}

/** Model loading progress for the overlay (P06b R8). */
export function useLoadProgress(): LoadProgress {
  const version = useModelsVersion()
  return useMemo(() => {
    void version
    return getLoadProgress()
  }, [version])
}

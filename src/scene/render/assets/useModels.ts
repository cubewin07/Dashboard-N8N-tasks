import { useEffect, useSyncExternalStore } from 'react'
import { getManifest, getModelsVersion, loadManifest, subscribeModels } from './modelStore'

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

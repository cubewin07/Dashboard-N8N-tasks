import type { AppearanceV1 } from '@/domain/appearance'
import { initAppearanceStore, useAppearanceCache } from '@/office/appearanceStore'

export interface AppearanceTarget {
  setAppearance(employeeId: string, doc: AppearanceV1): unknown
}

/**
 * Feed saved looks (from `src/office/appearanceStore`) into a character renderer: once for
 * everything already saved, then for each look that changes. Only the changed employee is
 * touched, so only that character re-assembles (R10). Returns the unsubscribe function.
 */
export function bindSavedAppearances(
  target: AppearanceTarget,
  onApplied?: () => void,
): () => void {
  const apply = (docs: Readonly<Record<string, AppearanceV1>>, prev: Readonly<Record<string, AppearanceV1>>): void => {
    let any = false
    for (const [id, doc] of Object.entries(docs)) {
      if (prev[id] === doc) continue
      target.setAppearance(id, doc)
      any = true
    }
    if (any) onApplied?.()
  }
  initAppearanceStore()
  apply(useAppearanceCache.getState().docs, {})
  return useAppearanceCache.subscribe((state, prev) => {
    if (state.docs !== prev.docs) apply(state.docs, prev.docs)
  })
}

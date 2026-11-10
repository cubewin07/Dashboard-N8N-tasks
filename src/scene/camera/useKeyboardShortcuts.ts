import { useEffect } from 'react'
import { useViewStore } from './viewStore'

function shouldIgnoreShortcut(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if ((el as HTMLElement).isContentEditable) return true
  if (el.closest('[role="dialog"]')) return true
  return false
}

export function useKeyboardShortcuts(floorKeys: readonly string[]): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (shouldIgnoreShortcut(e.target)) return

      const state = useViewStore.getState()

      if (e.key === '1') {
        e.preventDefault()
        state.setOverview()
        return
      }

      if (e.key === '2') {
        e.preventDefault()
        state.setFree()
        return
      }

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        const targetKey =
          state.hoveredFloorKey ??
          state.focusedFloorKey ??
          floorKeys[Math.min(1, floorKeys.length - 1)]
        if (targetKey) {
          state.focusFloor(targetKey)
        }
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        state.stepFloor(1, floorKeys)
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        state.stepFloor(-1, floorKeys)
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        state.setOverview()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [floorKeys])
}

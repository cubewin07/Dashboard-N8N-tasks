/**
 * The person drawer moves focus into itself when it opens. The people list
 * asks it not to when the selection is a side effect of "follow" (Enter), so
 * arrow-key browsing is not interrupted.
 */
let keepFocus = false

export function keepFocusOnNextDrawerOpen(): void {
  keepFocus = true
}

export function consumeKeepFocus(): boolean {
  const value = keepFocus
  keepFocus = false
  return value
}

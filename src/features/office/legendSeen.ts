const KEY = 'office.legendSeen.v1'

/** One flag per signed-in user on this browser: two people sharing a Mac each get the intro. */
export function legendSeenKey(userId: string): string {
  return `${KEY}:${userId}`
}

export function hasSeenLegend(userId: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  try {
    return storage?.getItem(legendSeenKey(userId)) === '1'
  } catch {
    return false
  }
}

export function markLegendSeen(userId: string, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(legendSeenKey(userId), '1')
  } catch {
    // Private mode or blocked storage: the legend may show again next time, nothing worse.
  }
}

/** Set by the onboarding E2E spec to opt in to the first-run legend in an E2E build. */
export const E2E_ONBOARDING_KEY = 'office.e2eOnboarding'

/**
 * Whether to open the legend by itself. E2E builds skip it (a sheet over the office would
 * block every other spec) unless the spec opts in through `E2E_ONBOARDING_KEY`.
 */
export function shouldAutoOpenLegend(
  userId: string | null,
  isE2E: boolean,
  forced = readFlag(E2E_ONBOARDING_KEY),
): boolean {
  if (!userId) return false
  if (isE2E && !forced) return false
  return !hasSeenLegend(userId)
}

function readFlag(key: string): boolean {
  try {
    return safeStorage()?.getItem(key) === '1'
  } catch {
    return false
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

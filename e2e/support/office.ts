import { expect, test, type Locator } from '@playwright/test'

/**
 * A full office load is about 170 model files. Software WebGL on a GitHub runner takes
 * 50 to 95 s for them (about 20 s on a developer Mac), so CI gets a much longer limit.
 */
const ASSETS_TIMEOUT_MS = process.env.CI ? 180_000 : 60_000

/**
 * Wait until every model has loaded. The wait is added to the running test's (or hook's)
 * time budget, so the steps after it keep the time the spec gave them.
 */
export async function waitForOfficeAssets(canvas: Locator): Promise<void> {
  test.setTimeout(test.info().timeout + ASSETS_TIMEOUT_MS)
  await expect(canvas).toHaveAttribute('data-assets', 'ready', { timeout: ASSETS_TIMEOUT_MS })
}

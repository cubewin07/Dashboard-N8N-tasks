import { expect, test, type Page } from '@playwright/test'

// P11-T05: the 3D office survives a lost WebGL context, and a device without WebGL2
// gets the 2D list with an explanation instead of a "Xem 3D" button.

async function login(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)
}

/** Lose or restore the office canvas context through WEBGL_lose_context. */
function loseContext(page: Page, action: 'loseContext' | 'restoreContext') {
  return page.evaluate((what) => {
    type LoseExt = { loseContext: () => void; restoreContext: () => void }
    const win = window as unknown as { __loseExt?: LoseExt }
    // A lost context returns null from getExtension, so keep the one taken before the loss.
    if (!win.__loseExt) {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-office-canvas] canvas')
      const ext = canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context') as LoseExt | null
      if (!ext) throw new Error('WEBGL_lose_context is not available')
      win.__loseExt = ext
    }
    win.__loseExt[what]()
  }, action)
}

test.describe('P11 office resilience', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'The 3D office is desktop-only.')

  test('a lost WebGL context shows a notice and the scene comes back', async ({ page }) => {
    await login(page)
    const office = page.locator('[data-office-canvas]')
    await expect(office).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })

    await loseContext(page, 'loseContext')
    await expect(office).toHaveAttribute('data-context', 'lost')
    await expect(page.locator('[data-context-overlay]')).toBeVisible()

    await loseContext(page, 'restoreContext')
    await expect(office).toHaveAttribute('data-context', 'ok')
    await expect(page.locator('[data-context-overlay]')).toHaveCount(0)
    await expect(office).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  })

  test('a context that never comes back rebuilds the canvas once by itself', async ({ page }) => {
    await login(page)
    const office = page.locator('[data-office-canvas]')
    await expect(office).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })

    await loseContext(page, 'loseContext')
    await expect(office).toHaveAttribute('data-context', 'lost')
    // No restore: after the wait the canvas is rebuilt with a fresh context.
    await expect(office).toHaveAttribute('data-context', 'ok', { timeout: 10_000 })
    await expect(office).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  })

  test('without WebGL2 the office explains the 2D list and offers no 3D button', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
        if (id === 'webgl2' || id === 'webgl') return null
        return (original as (...a: unknown[]) => unknown).call(this, id, ...rest)
      } as typeof original
    })
    await login(page)
    await expect(page.locator('[data-webgl-unavailable]')).toBeVisible()
    await expect(page.locator('[data-office-canvas]')).toHaveCount(0)
    await expect(page.locator('[data-employee-id]').first()).toBeVisible()
  })
})

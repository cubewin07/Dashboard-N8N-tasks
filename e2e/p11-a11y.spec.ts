import { expect, test, type Page } from '@playwright/test'

// P11-T12: findings from the accessibility audit, kept fixed.

async function loginAsBoss(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)
}

test('the first Tab reaches "skip to main content", which moves focus to main', async ({ page }) => {
  await loginAsBoss(page)
  await page.goto('./#/queue')
  await page.reload()
  await expect(page.locator('main h1')).toBeVisible()
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Bỏ qua, đến nội dung chính' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
  await expect(page).toHaveURL(/#\/queue$/)
})

test('the tour keeps keyboard focus: controls on start, start button on exit', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the tour runs on the 3D office')
  await loginAsBoss(page)
  await expect(page.locator('[data-office-canvas][data-ready="true"]')).toBeVisible({ timeout: 30_000 })
  await page.locator('[data-tour-start]').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-tour-pause]')).toBeFocused()
  // Space on the focused Pause button pauses once (not twice).
  await page.keyboard.press(' ')
  await expect(page.locator('[data-tour]')).toHaveAttribute('data-tour-status', 'paused')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-tour]')).toHaveCount(0)
  await expect(page.locator('[data-tour-start]')).toBeFocused()
})

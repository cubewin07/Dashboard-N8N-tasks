import { expect, test, type Page } from '@playwright/test'

async function loginStylist(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('stylist@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/wardrobe/)
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe('P08b wardrobe page', () => {
  test('stylist picks a person and sees the preview', async ({ page }, info) => {
    const phone = (page.viewportSize()?.width ?? 1440) < 600
    await loginStylist(page)

    const list = page.getByTestId('wardrobe-people')
    await expect(list.getByRole('option').first()).toBeVisible()
    await expect(page.getByTestId('wardrobe-device-only')).toBeVisible()
    await noHorizontalScroll(page)
    await page.screenshot({ path: `test-results/p08b-wardrobe-picker-${info.project.name}.png` })

    // Search narrows the list (diacritics ignored).
    await page.getByTestId('wardrobe-search').fill('pho giam')
    await expect(list.getByRole('option')).toHaveCount(1)
    await page.getByTestId('wardrobe-search').fill('')

    await list.getByRole('option').nth(1).click()
    await expect(page).toHaveURL(/#\/wardrobe\?id=emp_/)
    const preview = page.getByTestId('wardrobe-preview')
    await expect(preview).toBeVisible()
    await expect(preview).toHaveAttribute('data-ready', 'true', { timeout: 40_000 })
    await expect(page.getByTestId('wardrobe-outfit-description')).toContainText('đang mặc')
    await expect(page.getByTestId('wardrobe-editor')).toBeAttached()
    await noHorizontalScroll(page)

    if (phone) {
      await expect(list).toBeHidden()
      const box = await preview.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThan(200)
      await page.screenshot({ path: `test-results/p08b-wardrobe-editor-${info.project.name}.png` })
      await page.getByTestId('wardrobe-back').click()
      await expect(list).toBeVisible()
    } else {
      await expect(list).toBeVisible()
      await page.getByTestId('clip-walk').click()
      await expect(preview).toHaveAttribute('data-clip', 'walk')
      await page.getByTestId('zoom-head').click()
      await expect(preview).toHaveAttribute('data-zoom', 'head')
      await page.screenshot({ path: `test-results/p08b-wardrobe-editor-${info.project.name}.png` })
    }
  })

  test('deep link opens the person and falls back to thumbnails without WebGL', async ({ page }, info) => {
    await loginStylist(page)
    await page.goto('./#/wardrobe?nowebgl&id=emp_linh')
    const preview = page.getByTestId('wardrobe-preview')
    await expect(preview).toHaveAttribute('data-mode', 'fallback')
    await expect(page.getByTestId('wardrobe-thumb-stack').locator('li').first()).toBeVisible()
    await expect(page.getByTestId('wardrobe-editor')).toBeAttached()
    await noHorizontalScroll(page)
    await page.screenshot({ path: `test-results/p08b-wardrobe-fallback-${info.project.name}.png` })
  })
})

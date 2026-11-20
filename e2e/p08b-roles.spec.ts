import { expect, test, type Page } from '@playwright/test'

async function login(page: Page, email: string) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
}

test.describe('P08b roles', () => {
  test('stylist lands on the wardrobe, is fenced in, and never loads the office chunk', async ({ page }) => {
    const heavy: string[] = []
    page.on('request', (r) => {
      if (/OfficePage|OfficeCanvas|three/i.test(r.url())) heavy.push(r.url())
    })
    await login(page, 'stylist@demo.local')
    await expect(page).toHaveURL(/#\/wardrobe$/)

    for (const path of ['queue', '', 'org', 'admin', 'activity', 'tasks', 'nope']) {
      await page.goto(`./#/${path}`)
      await expect(page).toHaveURL(/#\/wardrobe$/)
    }

    const nav = page.locator('nav[aria-label]:visible')
    await expect(nav.getByRole('link', { name: 'Tủ đồ' }).first()).toBeVisible()
    for (const name of ['Hàng chờ', 'Sơ đồ', 'Nhật ký', 'Văn phòng']) {
      await expect(page.getByRole('link', { name })).toHaveCount(0)
    }
    await expect(page.locator('[data-nav-boss-queue-badge]')).toHaveCount(0)

    await page.goto('./#/settings')
    await expect(page).toHaveURL(/#\/settings$/)
    await expect(page.locator('[data-settings-motion]')).toHaveCount(0)

    expect(heavy).toEqual([])
  })

  test('boss still lands on the office and may open every route', async ({ page }) => {
    await login(page, 'boss@demo.local')
    await expect(page).toHaveURL(/#\/$/)
    // Let the office finish mounting; its URL sync would otherwise race the navigation.
    await expect(page.locator('[data-office-canvas][data-ready="true"], [data-org-list]').first()).toBeVisible({
      timeout: 20_000,
    })
    await page.waitForTimeout(500)
    await page.locator('a[href="#/queue"]:visible').first().click()
    await expect(page).toHaveURL(/#\/queue$/)
    await page.goto('./#/nope')
    await expect(page).toHaveURL(/#\/(\?.*)?$/)
  })

  test('unknown account is rejected with a generic error', async ({ page }) => {
    await login(page, 'nobody@demo.local')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/#\/login$/)
  })
})

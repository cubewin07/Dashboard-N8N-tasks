import { expect, test } from '@playwright/test'

test.describe('P01 foundation smoke', () => {
  test('logs in, renders home (3D on desktop, fallback on phone), and renders #/org', async ({
    page,
  }, testInfo) => {
    await page.goto('./#/login')

    await page.locator('#login-email').fill('boss@example.com')
    await page.locator('#login-password').fill('123456')
    await page.locator('button[type="submit"]').click()

    await expect(page).toHaveURL(/#\/$/)

    if (testInfo.project.name === 'phone') {
      await expect(page.locator('[data-org-list]')).toBeVisible()
      await expect(page.locator('canvas')).toHaveCount(0)

      const homeOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )
      expect(homeOverflow).toBe(true)
    } else {
      const canvasWrapper = page.locator('[data-office-canvas]')
      await expect(canvasWrapper).toBeVisible()
      await expect(canvasWrapper).toHaveAttribute('data-ready', 'true', {
        timeout: 15_000,
      })
      await expect(page.locator('[data-office-canvas] canvas')).toBeVisible()
      await expect(
        page.getByText('Toà nhà sẽ xuất hiện ở giai đoạn 2'),
      ).toBeVisible()
    }

    // Navigate to #/org
    await page.goto('./#/org')
    await expect(page.locator('[data-org-list]')).toBeVisible()
    await expect(page.getByText('Chăm sóc khách hàng')).toBeVisible()

    // Assert 6 floor sections: boss first, management second, then 4 departments
    const floorKeys = await page
      .locator('section[data-floor-key]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-floor-key')))
    expect(floorKeys).toEqual([
      'boss',
      'management',
      'accounting',
      'design',
      'marketing',
      'cs',
    ])

    await expect(page.locator('[data-employee-id]')).toHaveCount(28)

    if (testInfo.project.name === 'phone') {
      const orgOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )
      expect(orgOverflow).toBe(true)

      await page.goto('./#/settings')
      await expect(
        page.getByText('Chế độ hiển thị Văn phòng (3D / 2D)'),
      ).toBeVisible()
      const settingsOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )
      expect(settingsOverflow).toBe(true)
    } else {
      // Desktop: expand collapsible "Bản cũ" group and check legacy route
      const classicToggle = page.locator('aside button[aria-expanded]')
      await expect(classicToggle).toHaveAttribute('aria-expanded', 'false')
      await classicToggle.click()
      await expect(classicToggle).toHaveAttribute('aria-expanded', 'true')
      await page.locator('aside a[href="#/legacy"]').click()
      await expect(page).toHaveURL(/#\/legacy$/)
    }
  })
})

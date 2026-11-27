import { expect, test } from '@playwright/test'

test.describe('P01 foundation smoke', () => {
  test('logs in, renders home (3D on desktop, fallback on phone), and renders #/org', async ({
    page,
  }, testInfo) => {
    await page.goto('./#/login')

    await page.locator('#login-email').fill('boss@demo.local')
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
      await expect(page.locator('[data-floor-picker]')).toBeVisible()
      await expect(page.locator('[data-camera-mode-bar]')).toBeVisible()
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
      // P11-T07: the old MVP hashes redirect to the screens that replaced them.
      await expect(page.locator('aside button[aria-expanded]')).toHaveCount(0)
      for (const [from, to] of [
        ['inbox', /#\/queue$/],
        ['tasks', /#\/activity$/],
        ['team', /#\/org$/],
        // The office adds its own view state (`?cam=overview`) once it mounts.
        ['start', /#\/(\?.*)?$/],
        ['legacy', /#\/(\?.*)?$/],
      ] as const) {
        await page.goto(`./#/${from}`)
        await expect(page).toHaveURL(to)
      }
    }
  })
})

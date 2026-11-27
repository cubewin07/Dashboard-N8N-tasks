import { expect, test } from '@playwright/test'

// P11-T11 (R7): the legend opens by itself on the first visit to the 3D office, once per
// user, and the "Chú giải" button reopens it. E2E builds only auto-open when the spec opts in.

test('the legend opens once per user and can be reopened', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the 3D office')
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)

  await page.evaluate(() => localStorage.setItem('office.e2eOnboarding', '1'))
  await page.reload()
  const legend = page.locator('[data-legend]')
  await expect(legend).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-legend-first-run]')).toContainText('Chú giải')
  for (const row of ['bench', 'elevator', 'stairs', 'pile', 'courier']) {
    await expect(legend.locator(`[data-legend-row="${row}"]`)).toHaveCount(1)
  }
  await page.screenshot({ path: info.outputPath('p11-legend-first-run.png') })
  await page.keyboard.press('Escape')
  await expect(legend).toBeHidden()

  // Seen: a reload does not open it again.
  await page.reload()
  await expect(page.locator('[data-office-canvas]')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(500)
  await expect(legend).toHaveCount(0)

  // Reopen from the button, without the first-run note.
  await page.locator('[data-legend-button]').click()
  await expect(legend).toBeVisible()
  await expect(page.locator('[data-legend-first-run]')).toHaveCount(0)
})

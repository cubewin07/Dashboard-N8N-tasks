import { expect, test, type Page } from '@playwright/test'

// P11-T10 (R6): "Chế độ trình diễn" starts, pauses, skips, and exits; exit puts the camera
// and the sim back. The full unattended run (twice, same seed) is the runner's unit test.

async function loginAsBoss(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)
}

const simSeed = (page: Page) =>
  page.evaluate(() => {
    const dbg = (window as unknown as {
      __office_debug?: { sim?: { getSnapshot: () => { seed: string; speed: number } } }
    }).__office_debug
    return dbg?.sim?.getSnapshot()
  })

test('demo mode: start, pause, next, Esc restores camera and sim', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the tour runs on the 3D office')
  test.setTimeout(90_000)
  await loginAsBoss(page)
  await expect(page.locator('[data-office-canvas][data-ready="true"]')).toBeVisible({ timeout: 30_000 })

  // Something to restore: the Marketing floor, at the sim's own seed and speed.
  await page.locator('[data-floor-picker-item="marketing"]').click()
  await expect(page.locator('[data-floor-picker-item="marketing"]')).toHaveAttribute('aria-current', 'true')
  const before = await simSeed(page)

  await page.locator('[data-tour-start]').click()
  const tour = page.locator('[data-tour]')
  await expect(tour).toHaveAttribute('data-tour-step', 'overview')
  await expect(page.locator('[data-tour-caption]')).toContainText('Mỗi tầng là một phòng ban')
  await expect(page.locator('[data-camera-mode="overview"]')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await simSeed(page))?.seed).toBe('trinh-dien')
  await expect(page.locator('[data-tour-start]')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('p11-tour-overview.png') })

  await page.keyboard.press(' ')
  await expect(tour).toHaveAttribute('data-tour-status', 'paused')
  await page.keyboard.press(' ')
  await expect(tour).toHaveAttribute('data-tour-status', 'running')

  await page.keyboard.press('ArrowRight')
  await expect(tour).toHaveAttribute('data-tour-step', 'manager-request')
  await page.locator('[data-tour-next]').click()
  await expect(tour).toHaveAttribute('data-tour-step', 'cs-desk')
  await page.locator('[data-tour-next]').click()
  await expect(tour).toHaveAttribute('data-tour-step', 'working-desk')
  await expect(page.locator('[data-floor-picker-item="cs"]')).toHaveAttribute('aria-current', 'true')
  await page.screenshot({ path: info.outputPath('p11-tour-cs.png') })

  await page.keyboard.press('Escape')
  await expect(tour).toHaveCount(0)
  await expect(page.locator('[data-floor-picker-item="marketing"]')).toHaveAttribute('aria-current', 'true')
  await expect.poll(async () => simSeed(page)).toEqual(expect.objectContaining({ seed: before?.seed, speed: before?.speed }))
  await expect(page.locator('[data-tour-start]')).toBeVisible()
})

test('leaving the office ends the tour', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the tour runs on the 3D office')
  await loginAsBoss(page)
  await expect(page.locator('[data-office-canvas][data-ready="true"]')).toBeVisible({ timeout: 30_000 })
  await page.locator('[data-tour-start]').click()
  await expect(page.locator('[data-tour]')).toBeVisible()
  await page.goto('./#/queue')
  await expect.poll(async () => (await simSeed(page))?.seed).not.toBe('trinh-dien')
  await page.goto('./#/')
  await expect(page.locator('[data-tour-start]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-tour]')).toHaveCount(0)
})

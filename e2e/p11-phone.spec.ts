import { expect, test, type Page } from '@playwright/test'

// P11-T04: the phone fallback (R2), the 3D opt-in with its warning (R3), and one simulated
// company per browser profile: approving on a phone-sized page changes the desktop office.

async function loginAsBoss(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

test.describe('P11 phone fallback', () => {
  test('five tabs at 375×812, no sideways scroll, no 3D download', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone layout')
    const threeRequests: string[] = []
    page.on('request', (req) => {
      if (/OfficeCanvas|three|\.glb(\?|$)/.test(req.url())) threeRequests.push(req.url())
    })
    await loginAsBoss(page)
    const bar = page.getByRole('navigation', { name: /Menu chính/ }).last()
    const shots: [string, () => Promise<void>, RegExp][] = [
      ['so-do', () => bar.locator('[data-tab="office"]').click(), /#\/$/],
      ['duyet', () => bar.locator('[data-tab="queue"]').click(), /#\/queue$/],
      ['hoat-dong', () => bar.locator('[data-tab="activity"]').click(), /#\/activity$/],
      ['tu-do', () => bar.locator('[data-tab="wardrobe"]').click(), /#\/wardrobe/],
      [
        'cai-dat',
        async () => {
          await bar.getByRole('button', { name: 'Thêm' }).click()
          await page.getByRole('link', { name: 'Cài đặt' }).click()
        },
        /#\/settings$/,
      ],
    ]
    await expect(bar.locator('[data-tab="office"]')).toHaveText(/Sơ đồ/)
    for (const [name, open, url] of shots) {
      await open()
      await expect(page).toHaveURL(url)
      await expect(page.locator('main h1').first()).toBeVisible()
      await page.waitForTimeout(300)
      expect(await horizontalOverflow(page), name).toBeLessThanOrEqual(0)
      await page.screenshot({ path: info.outputPath(`p11-phone-${name}.png`) })
    }
    // The wardrobe's 3D preview is the one allowed exception (R2); the rest stays 2D.
    expect(threeRequests.filter((u) => !/wardrobe|Wardrobe|\.glb/.test(u))).toEqual([])
  })

  test('"Xem 3D (thử nghiệm)" warns first, is remembered, and can be turned off', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone layout')
    await loginAsBoss(page)
    await expect(page.locator('[data-org-list]').first()).toBeVisible()

    const optIn = page.locator('[data-view3d-optin]')
    await expect(optIn).toHaveText('Xem 3D (thử nghiệm)')
    await optIn.click()
    const warning = page.locator('[data-view3d-warning]')
    await expect(warning).toContainText('pin')
    await warning.getByRole('button', { name: 'Để sau' }).click()
    await expect(warning).toBeHidden()
    await expect(page.locator('[data-office-canvas]')).toHaveCount(0)

    await optIn.click()
    await page.locator('[data-view3d-confirm]').click()
    await expect(page.locator('[data-office-canvas]')).toBeVisible({ timeout: 20_000 })

    await page.reload()
    await expect(page.locator('[data-office-canvas]')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-tab="office"]')).toHaveText(/Văn phòng/)

    await page.getByRole('button', { name: 'Xem danh sách 2D' }).click()
    await expect(page.locator('[data-org-list]').first()).toBeVisible()
    await expect(page.locator('[data-office-canvas]')).toHaveCount(0)
  })
})

test.describe('P11 one company per browser profile', () => {
  test('approving on a phone-sized page lowers the desktop pile', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'desktop', 'two windows of one desktop profile')
    test.setTimeout(90_000)
    await loginAsBoss(page)
    await expect(page.locator('[data-office-canvas]')).toBeVisible({ timeout: 20_000 })

    // The desktop tab runs the simulation (it opened first). Put a boss item on the pile.
    await page.evaluate(() => {
      const dbg = (window as unknown as { __office_debug?: { sim?: { runScenario: (k: string) => void } } })
        .__office_debug
      dbg?.sim?.runScenario('angry_refund')
    })
    const badge = page.locator('[data-nav-boss-queue-badge]').first()
    await expect(badge).toBeVisible({ timeout: 30_000 })
    const before = Number(await badge.textContent())
    expect(before).toBeGreaterThan(0)

    const phone = await context.newPage()
    await phone.setViewportSize({ width: 375, height: 812 })
    await phone.goto('./#/queue')
    const item = phone.locator('[data-queue-item]').first()
    await expect(item).toBeVisible({ timeout: 15_000 })
    const reviewId = await item.getAttribute('data-queue-item')
    const approve = item.locator('[data-testid^="approve-"]')
    await approve.click()
    await expect(approve).toHaveAttribute('data-command-state', 'applied', { timeout: 10_000 })

    // The desktop office (not the phone) shows the item gone and the pile one lower.
    await expect
      .poll(async () => {
        const visible = await badge.isVisible()
        return visible ? Number(await badge.textContent()) : 0
      }, { timeout: 15_000 })
      .toBeLessThan(before)
    const stillPending = await page.evaluate((id) => {
      const dbg = (window as unknown as {
        __office_debug?: { getState?: () => { reviews: Record<string, { status: string }> } }
      }).__office_debug
      return dbg?.getState?.()?.reviews[id ?? '']?.status === 'pending'
    }, reviewId)
    expect(stillPending).toBe(false)
    await phone.close()
  })
})

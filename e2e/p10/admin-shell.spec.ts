import { expect, test, type Page } from '@playwright/test'

async function login(page: Page, email: string) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
}

test.describe('P10 admin shell (R1, R15)', () => {
  test('stylist visiting #/admin is redirected and never sees the nav entry', async ({ page }) => {
    const adminChunk: string[] = []
    page.on('request', (r) => {
      if (/AdminPage/i.test(r.url())) adminChunk.push(r.url())
    })
    await login(page, 'stylist@demo.local')
    await expect(page).toHaveURL(/#\/wardrobe$/)
    await page.goto('./#/admin?tab=policy')
    await expect(page).toHaveURL(/#\/wardrobe$/)
    await expect(page.getByRole('link', { name: 'Quản trị' })).toHaveCount(0)
    expect(adminChunk).toEqual([])
  })

  test('boss opens Quản trị, tabs follow ?tab=', async ({ page }) => {
    await login(page, 'boss@demo.local')
    await expect(page).toHaveURL(/#\/$/)
    // The nav entry (sidebar on desktop, "Thêm" sheet on phones).
    const link = page.getByRole('link', { name: 'Quản trị' })
    if (!(await link.isVisible())) await page.getByRole('button', { name: 'Thêm' }).click()
    await link.click()
    await expect(page).toHaveURL(/#\/admin/)
    await expect(page.getByRole('heading', { level: 1, name: 'Quản trị' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Phòng ban' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: 'Chính sách' }).click()
    await expect(page).toHaveURL(/tab=policy/)
    await page.goto('./#/admin?tab=rules')
    await expect(page.getByRole('tab', { name: 'Quy tắc duyệt' })).toHaveAttribute('aria-selected', 'true')
  })
})

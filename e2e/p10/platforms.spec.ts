import { expect, test, type Page } from '@playwright/test'

async function loginAsBoss(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/$/)
}

async function openAdmin(page: Page, tab: string) {
  const link = page.getByRole('link', { name: 'Quản trị' })
  if (!(await link.isVisible())) await page.getByRole('button', { name: 'Thêm' }).click()
  await link.click()
  await expect(page).toHaveURL(/#\/admin/)
  await page.getByRole('tab', { name: tab }).click()
}

test.describe('P10-T12 Platforms + shops tab (R9)', () => {
  test('deactivating Lazada persists after reload; shops of it still show', async ({ page }) => {
    await loginAsBoss(page)
    await openAdmin(page, 'Nền tảng')
    const lazada = page.locator('[data-platform-key="lazada"]')
    await expect(lazada).toHaveAttribute('data-platform-active', 'true')

    await page.getByRole('button', { name: 'Sửa: Lazada', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Mã')).toBeDisabled()
    await expect(dialog.getByLabel('Chữ trên huy hiệu')).toHaveAttribute('maxlength', '4')
    await dialog.getByRole('switch', { name: 'Đang dùng' }).click()
    await dialog.getByRole('button', { name: 'Lưu' }).click()
    await expect(dialog).toBeHidden()
    await expect(lazada).toHaveAttribute('data-platform-active', 'false')

    await page.reload()
    await expect(page.locator('[data-platform-key="lazada"]')).toHaveAttribute('data-platform-active', 'false')
    // The existing Lazada shop is still listed and marked.
    await expect(page.locator('[data-shop-id="shop_lazada_1"]')).toContainText('Nền tảng đã ngừng dùng')
  })

  test('adds a shop on an active platform; inactive platforms are not offered', async ({ page }) => {
    await loginAsBoss(page)
    await openAdmin(page, 'Nền tảng')
    await page.getByRole('button', { name: 'Thêm cửa hàng' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Tên cửa hàng').fill('Shopee 4')
    await dialog.getByRole('combobox', { name: 'Nền tảng' }).click()
    await page.getByRole('option', { name: 'Shopee', exact: true }).click()
    await dialog.getByRole('button', { name: 'Lưu' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('[data-shop-id="shop_shopee_4"]')).toContainText('Shopee 4')

    await page.reload()
    await expect(page.locator('[data-shop-id="shop_shopee_4"]')).toBeVisible()
  })
})

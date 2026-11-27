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

test.describe('P10-T09 Policy tab (R6)', () => {
  test('tempCap 10 → 4 persists after reload; "Mặc định" restores 10', async ({ page }) => {
    await loginAsBoss(page)
    await openAdmin(page, 'Chính sách')
    const tempCap = page.getByRole('spinbutton', { name: 'Số nhân viên tạm tối đa' })
    const save = page.getByRole('button', { name: 'Lưu' })
    await expect(tempCap).toHaveValue('10')
    await expect(save).toBeDisabled()

    await tempCap.fill('4')
    await expect(save).toBeEnabled()
    await save.click()
    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('spinbutton', { name: 'Số nhân viên tạm tối đa' })).toHaveValue('4')

    await page.getByRole('button', { name: 'Đặt lại về mặc định: Số nhân viên tạm tối đa' }).click()
    await expect(page.getByRole('spinbutton', { name: 'Số nhân viên tạm tối đa' })).toHaveValue('10')
    await page.getByRole('button', { name: 'Lưu' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('spinbutton', { name: 'Số nhân viên tạm tối đa' })).toHaveValue('10')
  })

  test('an out-of-range value keeps Lưu disabled', async ({ page }) => {
    await loginAsBoss(page)
    await openAdmin(page, 'Chính sách')
    await page.getByRole('spinbutton', { name: 'Số nhân viên tạm tối đa' }).fill('99')
    await expect(page.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })
})

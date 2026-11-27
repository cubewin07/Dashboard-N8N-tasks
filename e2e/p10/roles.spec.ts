import { expect, test, type Page } from '@playwright/test'

async function loginAsBoss(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.locator('[data-office-canvas][data-ready="true"], [data-org-list]').first()).toBeVisible({
    timeout: 20_000,
  })
  await page.waitForTimeout(500)
}

async function openRoles(page: Page) {
  const link = page.getByRole('link', { name: 'Quản trị', exact: true })
  if (!(await link.first().isVisible())) await page.getByRole('button', { name: 'Thêm' }).click()
  await link.first().click()
  await expect(page).toHaveURL(/#\/admin/)
  await page.getByRole('tab', { name: 'Vai trò' }).click()
  await expect(page).toHaveURL(/tab=roles/)
}

test.describe('P10 Roles tab (R3)', () => {
  test('built-in roles are locked; a custom role can be created, survives a reload and is deleted', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await loginAsBoss(page)
    await openRoles(page)

    // Built-in: lock badge, no delete button
    const worker = page.locator('[data-role-key="worker"]')
    await expect(worker).toContainText('Có sẵn')
    await expect(worker.getByRole('button', { name: /^Xoá vai trò/ })).toHaveCount(0)

    // Create
    await page.getByRole('button', { name: 'Thêm vai trò' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('Tên (tiếng Việt)').fill('Thực tập sinh')
    await expect(sheet.getByLabel('Mã vai trò')).toHaveValue('thuc_tap_sinh')
    await sheet.getByLabel('Cấp duyệt').selectOption('reviewer')
    await sheet.getByRole('button', { name: 'Lưu' }).click()
    await expect(sheet).toBeHidden()

    const card = page.locator('[data-role-key="thuc_tap_sinh"]')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Cấp duyệt: Kiểm duyệt')
    await expect(card.getByRole('button', { name: /^Xoá vai trò/ })).toBeEnabled()

    // Persists after reload
    await page.reload()
    await expect(page.getByRole('tab', { name: 'Vai trò' })).toHaveAttribute('aria-selected', 'true', {
      timeout: 20_000,
    })
    await expect(page.locator('[data-role-key="thuc_tap_sinh"]')).toBeVisible()

    // Delete (no holders)
    await page.locator('[data-role-key="thuc_tap_sinh"]').getByRole('button', { name: /^Xoá vai trò/ }).click()
    const confirm = page.getByRole('dialog')
    await confirm.getByRole('button', { name: 'Xoá vai trò', exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(page.locator('[data-role-key="thuc_tap_sinh"]')).toHaveCount(0)
  })
})

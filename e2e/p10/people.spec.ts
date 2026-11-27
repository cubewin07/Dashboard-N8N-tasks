import { expect, test, type Page } from '@playwright/test'

async function loginAsBoss(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/$/)
  // Let the office finish mounting; its URL sync would otherwise race the navigation.
  await expect(page.locator('[data-office-canvas][data-ready="true"], [data-org-list]').first()).toBeVisible({
    timeout: 20_000,
  })
  await page.waitForTimeout(500)
}

/** Client-side navigation through the nav (a reload would be fine too, but this is how people do it). */
async function openFromNav(page: Page, name: string, url: RegExp) {
  const link = page.getByRole('link', { name, exact: true })
  if (!(await link.first().isVisible())) await page.getByRole('button', { name: 'Thêm' }).click()
  await link.first().click()
  await expect(page).toHaveURL(url)
}

test.describe('P10 People tab (R5)', () => {
  test('hire a worker, see them in the org list, dismiss, then restore', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsBoss(page)
    await openFromNav(page, 'Quản trị', /#\/admin/)
    await page.getByRole('tab', { name: 'Nhân sự' }).click()
    await expect(page).toHaveURL(/tab=people/)

    // Hire
    await page.getByRole('button', { name: 'Tuyển người' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('button', { name: 'Lưu' })).toBeDisabled()
    await sheet.getByLabel('Tên', { exact: true }).fill('Tuấn Khải')
    await sheet.getByLabel('Phòng ban').selectOption({ label: 'Chăm sóc khách hàng' })
    await sheet.getByLabel('Loại nhân sự').selectOption('temp')
    await sheet.getByRole('checkbox', { name: 'Trả lời tin nhắn' }).click()
    await sheet.getByRole('button', { name: 'Lưu' }).click()
    await expect(sheet).toBeHidden()

    // Filter the list down to the new person
    await page.getByLabel('Loại', { exact: true }).selectOption('temp')
    const row = page.locator('[data-employee-id="emp_tuan_khai"]').first()
    await expect(row).toBeVisible()
    await expect(row).toContainText('Tuấn Khải')
    await expect(row).toContainText('Chăm sóc khách hàng')

    // Org list and the people list
    // Desktop: the Sơ đồ page; phone: the home tab, which is the same 2D org view (P11-T04).
    await openFromNav(page, 'Sơ đồ', /#\/(org)?$/)
    await expect(page.locator('[data-org-list] [data-employee-id="emp_tuan_khai"]')).toBeVisible()
    await page.getByRole('tab', { name: 'Nhân sự' }).click()
    await expect(page.locator('[data-person-row="emp_tuan_khai"]')).toBeVisible()

    // Dismiss through the confirmation dialog
    await openFromNav(page, 'Quản trị', /#\/admin/)
    await page.getByRole('tab', { name: 'Nhân sự' }).click()
    await page.getByRole('button', { name: 'Cho nghỉ: Tuấn Khải' }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm.getByText('Cho nghỉ Tuấn Khải?')).toBeVisible()
    await confirm.getByRole('button', { name: 'Cho nghỉ', exact: true }).click()
    await expect(confirm).toBeHidden()

    const archive = page.locator('[data-admin-archive]')
    const archived = archive.locator('[data-employee-id="emp_tuan_khai"]')
    await expect(archived).toBeVisible()
    await expect(archived).toContainText('Khi nào')
    await expect(archived).toContainText('Lý do')
    // Gone from the active list
    await expect(page.locator('[data-people-table] [data-employee-id="emp_tuan_khai"], [data-people-cards] [data-employee-id="emp_tuan_khai"]')).toHaveCount(0)

    // Restore
    await archived.getByRole('button', { name: /Khôi phục/ }).click()
    await expect(archived).toHaveCount(0)
    await expect(
      page.locator('[data-people-table] [data-employee-id="emp_tuan_khai"], [data-people-cards] [data-employee-id="emp_tuan_khai"]'),
    ).toBeVisible()
  })

  test('row actions go to the office and to the wardrobe', async ({ page }) => {
    await loginAsBoss(page)
    await openFromNav(page, 'Quản trị', /#\/admin/)
    await page.getByRole('tab', { name: 'Nhân sự' }).click()
    await expect(page.locator('[data-employee-id="emp_trang"]').first()).toBeVisible()
    // No horizontal page scroll (cards on phones, a scrolling table wrapper on desktop).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    await page.getByRole('link', { name: 'Đổi diện mạo: Trang' }).click()
    await expect(page).toHaveURL(/#\/wardrobe\?id=emp_trang/)
  })
})

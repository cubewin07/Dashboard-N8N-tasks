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

const floorCount = (page: Page) =>
  page.evaluate(() => {
    const dbg = (window as unknown as { __office_debug?: { floorKeys?: string[] } }).__office_debug
    return dbg?.floorKeys?.length ?? 0
  })

test.describe('P10-T06 Departments tab (R2)', () => {
  test('boss adds "Kho vận": org list gets the floor, the 3D building gets one more floor', async ({
    page,
  }, testInfo) => {
    const desktop = testInfo.project.name !== 'phone'
    await loginAsBoss(page)
    let before = 0
    if (desktop) {
      await expect.poll(() => floorCount(page), { timeout: 30_000 }).toBeGreaterThan(0)
      before = await floorCount(page)
    }

    await openAdmin(page, 'Phòng ban')
    await page.getByRole('button', { name: 'Thêm phòng ban' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Tên (tiếng Việt)').fill('Kho vận')
    await expect(dialog.getByLabel('Mã')).toHaveValue('kho_van')
    await dialog.getByRole('button', { name: 'Lưu' }).click()
    await expect(dialog).toBeHidden()
    const row = page.locator('[data-department-key="kho_van"]')
    await expect(row).toContainText('Kho vận')
    // New departments go last.
    await expect(page.locator('[data-department-key]').last()).toHaveAttribute('data-department-key', 'kho_van')

    await page.goto('./#/org')
    await expect(page.locator('section[data-floor-key="kho_van"]')).toContainText('Kho vận')

    if (desktop) {
      await page.goto('./#/')
      await expect.poll(() => floorCount(page), { timeout: 30_000 }).toBe(before + 1)
    }
  })

  test('renaming a department shows the new name in the org list', async ({ page }) => {
    await loginAsBoss(page)
    await openAdmin(page, 'Phòng ban')
    await page.getByRole('button', { name: 'Sửa: Thiết kế' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Mã')).toBeDisabled()
    await dialog.getByLabel('Tên (tiếng Việt)').fill('Sáng tạo')
    await dialog.getByRole('button', { name: 'Lưu' }).click()
    await expect(dialog).toBeHidden()
    await page.goto('./#/org')
    await expect(page.locator('section[data-floor-key="design"]')).toContainText('Sáng tạo')
  })

  test('deactivating a department with staff is refused inline', async ({ page }) => {
    await loginAsBoss(page)
    await openAdmin(page, 'Phòng ban')
    await page.getByRole('button', { name: 'Sửa: Marketing' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('switch', { name: 'Đang dùng' }).click()
    await expect(dialog.getByTestId('department-refusal')).toContainText('Không thể ngừng dùng')
    await expect(dialog.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  test('up/down buttons reorder the list and the boss floor is not in it', async ({ page }) => {
    await loginAsBoss(page)
    await openAdmin(page, 'Phòng ban')
    const keys = () => page.locator('[data-department-key]').evaluateAll((els) => els.map((e) => e.getAttribute('data-department-key')))
    expect(await keys()).toEqual(['cs', 'marketing', 'design', 'accounting'])
    await page.getByRole('button', { name: 'Xuống dưới: Chăm sóc khách hàng' }).click()
    await expect.poll(keys).toEqual(['marketing', 'cs', 'design', 'accounting'])
    await expect(page.getByRole('button', { name: 'Lên trên: Marketing' })).toBeDisabled()
  })
})

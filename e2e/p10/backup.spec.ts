import { expect, test, type Page } from '@playwright/test'

async function openAdmin(page: Page, tab: string, heading: string) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/$/)
  const link = page.getByRole('link', { name: 'Quản trị' })
  if (!(await link.isVisible())) await page.getByRole('button', { name: 'Thêm' }).click()
  await link.click()
  await expect(page).toHaveURL(/#\/admin/)
  await goTab(page, tab, heading)
}

async function goTab(page: Page, tab: string, heading: string) {
  await page.goto(`./#/admin?tab=${tab}`)
  await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible()
}

/** The department the rule tester starts with (first active one), as the config currently names it. */
async function firstDepartmentName(page: Page): Promise<string> {
  await goTab(page, 'rules', 'Quy tắc duyệt')
  return (await page.getByTestId('rule-tester').getByRole('combobox', { name: 'Phòng ban' }).innerText()).trim()
}

test.describe('P10 backup tab (R14)', () => {
  test('importing an invalid file shows an error and changes nothing', async ({ page }) => {
    await openAdmin(page, 'backup', 'Sao lưu và khôi phục')
    const before = await firstDepartmentName(page)
    await goTab(page, 'backup', 'Sao lưu và khôi phục')

    await page.getByTestId('import-file').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ this is not json'),
    })
    await expect(page.getByTestId('import-error')).toContainText('không phải JSON hợp lệ')
    await expect(page.getByRole('button', { name: 'Áp dụng cấu hình này' })).toHaveCount(0)

    // Right shape, broken content: the issues are listed and there is nothing to apply.
    const broken = {
      format: 'ai-office-config',
      version: 1,
      exportedAt: '2026-11-26T00:00:00Z',
      config: { departments: [{ id: 'dep_x', key: 'Bad Key' }], employees: [] },
    }
    await page.getByTestId('import-file').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(broken)),
    })
    await expect(page.getByTestId('import-error')).toContainText('Tệp có lỗi, chưa áp dụng gì cả')
    await expect(page.getByTestId('import-error').getByRole('listitem').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Áp dụng cấu hình này' })).toHaveCount(0)

    expect(await firstDepartmentName(page)).toBe(before)
  })

  test('export, edit through import with a diff, then reset with a typed confirmation', async ({ page }) => {
    await openAdmin(page, 'backup', 'Sao lưu và khôi phục')
    const original = await firstDepartmentName(page)
    await goTab(page, 'backup', 'Sao lưu và khôi phục')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Tải tệp cấu hình' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^ai-office-config-\d{4}-\d{2}-\d{2}\.json$/)
    const path = await download.path()
    const { readFileSync } = await import('node:fs')
    const file = JSON.parse(readFileSync(path, 'utf8')) as {
      format: string
      config: { departments: { label: { vi: string; en: string } }[] }
    }
    expect(file.format).toBe('ai-office-config')

    // Identical file: nothing to apply.
    await page.getByTestId('import-file').setInputFiles({
      name: 'same.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(file)),
    })
    await expect(page.getByTestId('import-diff')).toContainText('giống hệt')
    await expect(page.getByRole('button', { name: 'Áp dụng cấu hình này' })).toBeDisabled()

    // Renamed department: the diff names it, then it is applied.
    file.config.departments[0]!.label.vi = 'Kho vận'
    await page.getByTestId('import-file').setInputFiles({
      name: 'renamed.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(file)),
    })
    await expect(page.getByTestId('import-diff')).toContainText('Phòng ban')
    await expect(page.getByTestId('import-diff')).toContainText('Kho vận')
    await page.getByRole('button', { name: 'Áp dụng cấu hình này' }).click()
    await expect(page.getByTestId('import-diff')).toHaveCount(0)
    expect(await firstDepartmentName(page)).toBe('Kho vận')

    // Reset needs the typed word.
    await goTab(page, 'backup', 'Sao lưu và khôi phục')
    await page.getByRole('button', { name: 'Khôi phục mặc định…' }).click()
    const dialog = page.getByRole('dialog')
    const confirm = dialog.getByRole('button', { name: 'Khôi phục', exact: true })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Gõ KHÔI PHỤC để xác nhận').fill('khoi phuc')
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Gõ KHÔI PHỤC để xác nhận').fill('KHÔI PHỤC')
    await confirm.click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    expect(await firstDepartmentName(page)).toBe(original)
    await page.reload()
    await expect(page.getByRole('heading', { level: 2, name: 'Quy tắc duyệt' })).toBeVisible()
    expect(await firstDepartmentName(page)).toBe(original)
  })

  test('the history tab lists the import and reset', async ({ page }) => {
    await openAdmin(page, 'backup', 'Sao lưu và khôi phục')
    await page.getByRole('button', { name: 'Khôi phục mặc định…' }).click()
    await page.getByRole('dialog').getByLabel('Gõ KHÔI PHỤC để xác nhận').fill('KHÔI PHỤC')
    await page.getByRole('dialog').getByRole('button', { name: 'Khôi phục', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await goTab(page, 'history', 'Nhật ký thay đổi')
    const first = page.getByTestId('history-entry').first()
    await expect(first).toContainText('Toàn bộ cấu hình')
    await expect(first).toContainText('Thay toàn bộ')
    await page.getByRole('button', { name: 'Làm mới' }).click()
    await expect(page.getByTestId('history-entry').first()).toBeVisible()
  })
})

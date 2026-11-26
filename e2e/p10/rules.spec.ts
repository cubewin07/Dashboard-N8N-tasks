import { expect, test, type Page } from '@playwright/test'

async function openAdmin(page: Page, tab: string) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/$/)
  const link = page.getByRole('link', { name: 'Quản trị' })
  if (!(await link.isVisible())) await page.getByRole('button', { name: 'Thêm' }).click()
  await link.click()
  await expect(page).toHaveURL(/#\/admin/)
  await page.goto(`./#/admin?tab=${tab}`)
  await expect(page.getByRole('heading', { level: 2, name: 'Quy tắc duyệt' })).toBeVisible()
}

const ruleIds = (page: Page) => page.locator('[data-testid="rules-list"] > li').evaluateAll((els) => els.map((e) => e.getAttribute('data-rule-id')))

test.describe('P10 rules tab (R7, R8)', () => {
  test('disable a rule and reorder; both survive a reload', async ({ page }) => {
    await openAdmin(page, 'rules')
    const first = page.locator('[data-rule-id="boss_sensitive"]')
    const toggle = first.getByRole('switch')
    await expect(toggle).toBeChecked()
    await toggle.click()
    await expect(toggle).not.toBeChecked()
    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu' })).toBeVisible()

    expect((await ruleIds(page)).slice(0, 2)).toEqual(['boss_sensitive', 'boss_big_amount'])
    await first.getByRole('button', { name: /^Xuống dưới/ }).click()
    await expect.poll(() => ruleIds(page).then((ids) => ids.slice(0, 2))).toEqual(['boss_big_amount', 'boss_sensitive'])
    await expect(page.getByRole('status').filter({ hasText: 'Đã lưu' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { level: 2, name: 'Quy tắc duyệt' })).toBeVisible()
    expect((await ruleIds(page)).slice(0, 2)).toEqual(['boss_big_amount', 'boss_sensitive'])
    await expect(page.locator('[data-rule-id="boss_sensitive"]').getByRole('switch')).not.toBeChecked()
  })

  test('the tester explains a refund sample and follows a draft rule before it is saved', async ({ page }) => {
    await openAdmin(page, 'rules')
    const tester = page.getByTestId('rule-tester')
    const reason = page.getByTestId('rule-tester-reason')

    await tester.getByRole('combobox', { name: 'Loại việc' }).click()
    await page.getByRole('option', { name: 'Xử lý yêu cầu hoàn tiền' }).click()
    // Seed: refund / money tags alone stay below the boss.
    await expect(reason).toContainText('Cần: Trưởng phòng duyệt')

    // An irreversible refund is a sensitive action: the boss, via "Việc nhạy cảm".
    await tester.getByLabel('Thẻ của việc').fill('irreversible')
    await tester.getByLabel('Thẻ của việc').press('Enter')
    await expect(reason).toContainText('Cần: Sếp duyệt, vì quy tắc Việc nhạy cảm cần Sếp duyệt')
    await expect(page.getByTestId('rule-tester-chain')).toContainText('Sếp')
    await tester.getByRole('button', { name: 'Bỏ thẻ irreversible' }).click()
    await expect(reason).toContainText('Cần: Trưởng phòng duyệt')

    // Draft: a new unsaved rule "refund → boss" changes the answer in the sheet and behind it.
    await page.getByRole('button', { name: 'Thêm quy tắc' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('Tên (tiếng Việt)').fill('Hoàn tiền cần Sếp')
    await sheet.getByLabel('Có một trong các thẻ').fill('refund')
    await sheet.getByLabel('Có một trong các thẻ').press('Enter')
    await sheet.getByRole('radio', { name: /Sếp/ }).check()
    await expect(sheet.getByTestId('rule-tester-draft-reason')).toContainText(
      'Cần: Sếp duyệt, vì quy tắc Hoàn tiền cần Sếp',
    )
    await expect(reason).toContainText('Cần: Sếp duyệt, vì quy tắc Hoàn tiền cần Sếp')

    // Edit the draft again: lowering the level changes the answer live.
    await sheet.getByRole('radio', { name: /Kiểm duyệt viên/ }).check()
    await expect(sheet.getByTestId('rule-tester-draft-reason')).toContainText('Cần: Kiểm duyệt viên duyệt')

    // Cancel: nothing was saved, the saved rules answer again.
    await sheet.getByRole('button', { name: 'Huỷ' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(reason).toContainText('Cần: Trưởng phòng duyệt')
    expect(await ruleIds(page)).not.toContain('hoan_tien_can_sep')
  })

  test('create a rule with the condition builder and delete it with confirmation', async ({ page }) => {
    await openAdmin(page, 'rules')
    await page.getByRole('button', { name: 'Thêm quy tắc' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('Tên (tiếng Việt)').fill('Chi lớn')
    await sheet.getByLabel('Số tiền từ').fill('1500000')
    await expect(sheet.getByLabel('Số tiền từ')).toHaveValue('1.500.000')
    await sheet.getByRole('radio', { name: /Sếp/ }).check()
    await sheet.getByRole('button', { name: 'Lưu' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const row = page.locator('[data-rule-id="chi_lon"]')
    await expect(row).toContainText('Số tiền từ 1.500.000đ trở lên')

    await row.getByRole('button', { name: /^Xoá/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Xoá quy tắc' }).click()
    await expect(row).toHaveCount(0)
  })
})

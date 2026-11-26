import { expect, test, type Page } from '@playwright/test'

// P10-T16: every Quản trị tab at 375 px, and a keyboard-only run through
// "add department → hire → edit rule".

const TABS = [
  ['departments', 'Phòng ban'],
  ['people', 'Nhân sự'],
  ['roles', 'Vai trò'],
  ['specialties', 'Chuyên môn'],
  ['policy', 'Chính sách'],
  ['rules', 'Quy tắc duyệt'],
  ['platforms', 'Nền tảng'],
  ['history', 'Nhật ký thay đổi'],
  ['backup', 'Sao lưu'],
] as const

async function loginAsBoss(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/$/)
}

async function openAdmin(page: Page) {
  const link = page.getByRole('link', { name: 'Quản trị' })
  if (!(await link.isVisible())) await page.getByRole('button', { name: 'Thêm' }).click()
  await link.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Quản trị' })).toBeVisible()
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

/** Accessible-ish name of the focused element: aria-label, its label, or its text. */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return ''
    const byId = el.getAttribute('aria-labelledby')
    const labelled = byId
      ? byId
          .split(' ')
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
      : ''
    const label =
      el.getAttribute('aria-label') ??
      (labelled ||
        ((el as HTMLInputElement).labels?.[0]?.textContent ?? '') ||
        el.textContent ||
        '')
    return label.replace(/\s+/g, ' ').trim()
  })

/** Press Tab until the focused element's name matches; fails if it never does. */
async function tabTo(page: Page, name: RegExp, role?: string, max = 120) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    if (role && (await page.evaluate(() => document.activeElement?.getAttribute('role'))) !== role) continue
    if (name.test(await focusedName(page))) return
  }
  throw new Error(`Never reached ${name} with Tab`)
}

test.describe('P10-T16 phone pass (375 px)', () => {
  test('every tab fits 375 px with no horizontal scroll; editor sheets are full-screen', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone project only')
    await loginAsBoss(page)
    await openAdmin(page)

    for (const [key, label] of TABS) {
      await page.getByRole('tab', { name: label }).click()
      await expect(page.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tabpanel')).toBeVisible()
      expect(await horizontalOverflow(page), `${key} overflows`).toBeLessThanOrEqual(0)
      const shot = await page.screenshot({ fullPage: true, path: `test-results/p10-phone/${key}.png` })
      await testInfo.attach(`375-${key}`, { body: shot, contentType: 'image/png' })
    }

    await page.getByRole('tab', { name: 'Phòng ban' }).click()
    await page.getByRole('button', { name: 'Thêm phòng ban' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    const box = await sheet.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(374)
    const shot = await page.screenshot({ path: 'test-results/p10-phone/department-sheet.png' })
    await testInfo.attach('375-department-sheet', { body: shot, contentType: 'image/png' })
  })
})

test.describe('P10-T16 keyboard only', () => {

  test('add department → hire → edit rule without the mouse', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop project only')
    await loginAsBoss(page)
    await openAdmin(page)

    // 1. Add a department.
    await tabTo(page, /^Thêm phòng ban$/)
    await page.keyboard.press('Enter')
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await tabTo(page, /^Tên \(tiếng Việt\)/)
    await page.keyboard.type('Kho vận')
    await tabTo(page, /^Lưu$/)
    await page.keyboard.press('Enter')
    await expect(sheet).toBeHidden()
    await expect(page.locator('[data-department-key="kho_van"]')).toContainText('Kho vận')

    // 2. Hire into Chăm sóc khách hàng. Tabs use roving focus: Tab to the active tab, arrows move.
    await tabTo(page, /^Phòng ban$/, 'tab')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Nhân sự' })).toHaveAttribute('aria-selected', 'true')
    await tabTo(page, /^Tuyển người$/)
    await page.keyboard.press('Enter')
    await expect(sheet).toBeVisible()
    await tabTo(page, /^Tên$/)
    await page.keyboard.type('Bảo Ngọc')
    await tabTo(page, /^Phòng ban/)
    // Native select type-ahead (ASCII is enough to land on "Chăm sóc khách hàng").
    await page.keyboard.type('Ch')
    await expect(sheet.getByLabel('Phòng ban').locator('option:checked')).toHaveText('Chăm sóc khách hàng')
    await tabTo(page, /^Trả lời tin nhắn/)
    await page.keyboard.press('Space')
    await tabTo(page, /^Lưu$/)
    await page.keyboard.press('Enter')
    await expect(sheet).toBeHidden()
    await expect(page.locator('[data-people-table] [data-employee-id="emp_bao_ngoc"]')).toBeVisible()

    // 3. Rename an approval rule.
    await tabTo(page, /^Nhân sự$/, 'tab')
    // One arrow per tab, waiting for each: Radix roving focus moves focus in a setTimeout, so
    // presses sent in the same tick all start from the same tab (real key-repeat is fine).
    for (const label of ['Vai trò', 'Chuyên môn', 'Chính sách', 'Quy tắc duyệt']) {
      await page.keyboard.press('ArrowRight')
      await expect(page.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tab', { name: label })).toBeFocused()
    }
    await tabTo(page, /^Sửa ?Việc nhạy cảm/)
    await page.keyboard.press('Enter')
    await expect(sheet).toBeVisible()
    await tabTo(page, /^Tên \(tiếng Việt\)/)
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('Việc nhạy cảm (đã sửa)')
    await tabTo(page, /^Lưu$/)
    await page.keyboard.press('Enter')
    await expect(sheet).toBeHidden()
    await expect(page.locator('[data-rule-id="boss_sensitive"]')).toContainText('Việc nhạy cảm (đã sửa)')
  })
})

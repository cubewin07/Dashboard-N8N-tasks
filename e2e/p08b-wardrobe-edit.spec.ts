import { expect, test, type Page } from '@playwright/test'

async function loginStylist(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('stylist@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/wardrobe/)
}

async function openTab(page: Page, name: string) {
  await page.getByTestId('wardrobe-editor').getByRole('tab', { name, exact: true }).click()
}

/** Picks a top other than the current one from the item grid (the radiogroup named "Áo"); returns its label. */
async function pickOtherTop(page: Page) {
  const grid = page.getByTestId('wardrobe-editor').getByRole('radiogroup', { name: 'Áo', exact: true })
  const name = (await grid.locator('[role="radio"][aria-checked="false"]').first().getAttribute('aria-label')) ?? ''
  const label = name.split('.')[0]!.trim()
  const other = grid.getByRole('radio', { name: label, exact: true })
  await other.click()
  await expect(other).toHaveAttribute('aria-checked', 'true')
  return label
}

test.describe('P08b wardrobe editing', () => {
  test('edit, leave prompt, compare, save and reload', async ({ page }, info) => {
    const phone = (page.viewportSize()?.width ?? 1440) < 600
    // Phone leaves the person with the back button; desktop leaves the page through the nav.
    const leave = () =>
      phone ? page.getByTestId('wardrobe-back').click() : page.getByRole('link', { name: 'Cài đặt' }).first().click()
    await loginStylist(page)
    await page.goto('./#/wardrobe?id=emp_linh')
    const preview = page.getByTestId('wardrobe-preview')
    await expect(preview).toHaveAttribute('data-ready', 'true', { timeout: 40_000 })

    const save = page.getByTestId('wardrobe-toolbar').getByRole('button', { name: 'Lưu', exact: true })
    await expect(save).toBeDisabled()

    await openTab(page, 'Áo')
    const label = await pickOtherTop(page)
    expect(label.length).toBeGreaterThan(0)
    // The draft drives the preview: the outfit description names the new top.
    await expect(page.getByTestId('wardrobe-outfit-description')).toContainText(label)
    await expect(save).toBeEnabled()
    await expect(preview).toHaveAttribute('data-ready', 'true', { timeout: 40_000 })
    await page.screenshot({ path: `test-results/p08b-wardrobe-edited-${info.project.name}.png`, fullPage: true })

    // Undo/redo shortcut round trip.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByTestId('wardrobe-outfit-description')).not.toContainText(label)
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(page.getByTestId('wardrobe-outfit-description')).toContainText(label)

    // Hold to compare: the preview shows the saved (here: generated) look while pressed.
    const desc = page.getByTestId('wardrobe-outfit-description')
    await page.getByTestId('wardrobe-toolbar').getByRole('button', { name: /^So sánh/ }).hover()
    await page.mouse.down()
    await expect(desc).not.toContainText(label)
    await page.mouse.up()
    await expect(desc).toContainText(label)

    // Leaving with unsaved changes asks first; "stay" keeps the draft.
    await leave()
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    await expect(dialog).toContainText('Bỏ các thay đổi chưa lưu?')
    await dialog.getByRole('button', { name: 'Ở lại chỉnh tiếp' }).click()
    await expect(page).toHaveURL(/#\/wardrobe\?id=emp_linh/)
    await expect(page.getByTestId('wardrobe-outfit-description')).toContainText(label)

    await save.click()
    await expect(page.getByText('Đã lưu diện mạo')).toBeVisible()
    await expect(save).toBeDisabled()

    // Saved looks survive a reload (local appearance store).
    await page.reload()
    await expect(preview).toHaveAttribute('data-ready', 'true', { timeout: 40_000 })
    await expect(page.getByTestId('wardrobe-outfit-description')).toContainText(label)

    // No prompt once everything is saved.
    await leave()
    await expect(page).toHaveURL(phone ? /#\/wardrobe$/ : /#\/settings/)
  })
})

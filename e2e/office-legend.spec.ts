import { expect, test, type Page } from '@playwright/test'

/** Letters only Vietnamese text has (any diacritic or đ). */
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i

interface Debug {
  sim?: {
    runScenario: (key: string) => void
    setSpeed: (speed: number) => void
  }
  getState: () => {
    questions: Record<
      string,
      { id: string; fromId: string; toId: string; status: string; inPerson: boolean; createdAt: string }
    >
  }
}

async function login(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@example.com')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)
}

test.describe('P05 legend and drawer parity', () => {
  test('legend opens by keyboard, every row is Vietnamese, Esc closes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'The legend lives in the 3D camera bar (desktop).')
    await login(page)
    const canvas = page.locator('[data-office-canvas]')
    await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })

    const button = page.locator('[data-legend-button]')
    await expect(button).toHaveText('Chú giải')
    await button.focus()
    await page.keyboard.press('Enter')

    const legend = page.locator('[data-legend]')
    await expect(legend).toBeVisible()
    await expect(legend.getByRole('heading', { name: 'Chú giải ký hiệu' })).toBeVisible()

    const rows = legend.locator('[data-legend-row]')
    const count = await rows.count()
    expect(count).toBeGreaterThan(25)
    for (const text of await rows.allInnerTexts()) {
      expect(text.trim().length).toBeGreaterThan(0)
      expect(text).toMatch(VIETNAMESE)
    }
    // Every status look, a platform badge and a priority edge are listed.
    await expect(legend.locator('[data-legend-row="status-blocked"]')).toContainText('nhấp nháy')
    await expect(legend.locator('[data-legend-row="platform-shopee"]')).toBeVisible()
    await expect(legend.locator('[data-legend-row="pile-urgent"]')).toContainText('Khẩn cấp')

    await page.keyboard.press('Escape')
    await expect(legend).toHaveCount(0)
    await expect(button).toBeFocused()
  })

  test('drawer shows the waiting position from the domain', async ({ page }, testInfo) => {
    await login(page)
    if (testInfo.project.name !== 'phone') {
      // Let the office finish mounting first: it writes its camera state into
      // the URL and would undo an earlier navigation (pre-existing race).
      await expect(page.locator('[data-office-canvas]')).toHaveAttribute('data-ready', 'true', {
        timeout: 20_000,
      })
      await page.waitForTimeout(500)
    }
    await page.goto('./#/org')
    await expect(page.getByRole('tablist')).toBeVisible()
    await page.getByRole('tab').nth(1).click()
    await expect(page.locator('[data-person-row]').first()).toBeVisible()

    const second = await page.evaluate(() => {
      const dbg = (window as unknown as { __office_debug: Debug }).__office_debug
      dbg.sim!.setSpeed(0)
      dbg.sim!.runScenario('long_queue')
      const qs = Object.values(dbg.getState().questions)
        .filter((q) => q.toId === 'emp_hai' && q.status === 'open' && q.inPerson)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.id < b.id ? -1 : 1))
      return qs[1]?.fromId ?? null
    })
    expect(second).not.toBeNull()

    await page.locator(`[data-person-row="${second}"]`).click()
    const drawer = page.locator('[data-person-drawer]')
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('[data-drawer-field="waiting"]')).toContainText('Đang chờ · vị trí 2')
    await expect(drawer.locator('[data-drawer-field="waiting"]')).toContainText('Hải')
  })
})

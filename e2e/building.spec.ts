import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const SCREENSHOT_DIR = path.resolve(import.meta.dirname, '../test-results/p02-screenshots')

test.describe('P02 building blockout and camera modes', () => {
  test('renders 8-floor building, camera modes, URL sync, shortcuts, and dynamic department updates', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000)

    await page.goto('./#/login')
    await page.locator('#login-email').fill('boss@example.com')
    await page.locator('#login-password').fill('123456')
    await page.locator('button[type="submit"]').click()

    await expect(page).toHaveURL(/#\/(\?.*)?$/)

    if (testInfo.project.name === 'phone') {
      await expect(page.locator('[data-org-list]')).toBeVisible()
      await expect(page.locator('canvas')).toHaveCount(0)
      return
    }

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

    const canvasWrapper = page.locator('[data-office-canvas]')
    await expect(canvasWrapper).toBeVisible()
    await expect(canvasWrapper).toHaveAttribute('data-ready', 'true', {
      timeout: 20_000,
    })

    // P06b: wait until every model has loaded and the scenery is baked
    await expect(canvasWrapper).toHaveAttribute('data-assets', 'ready', {
      timeout: 30_000,
    })
    await expect(page.locator('[data-load-progress]')).toHaveCount(0)
    await page.waitForTimeout(500)

    // Verify 8 floors top-to-bottom in FloorPicker
    const pickerItems = page.locator('[data-floor-picker-item]')
    await expect(pickerItems).toHaveCount(8)
    const pickerKeys = await pickerItems.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-floor-picker-item')),
    )
    expect(pickerKeys).toEqual([
      'boss',
      'management',
      'games_rest',
      'accounting',
      'design',
      'marketing',
      'cs',
      'lobby_cafe',
    ])

    // 1. Overview mode + screenshot + draw call budget check
    await expect(canvasWrapper).toHaveAttribute('data-camera-mode-state', 'overview')
    await expect(page.locator('[data-camera-mode="overview"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.locator('[data-camera-mode="follow"]')).toBeDisabled()

    await page.waitForTimeout(300)
    const overviewShot = await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'p02-overview.png'),
    })
    await testInfo.attach('p02-overview', {
      body: overviewShot,
      contentType: 'image/png',
    })

    const debugStats = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __office_debug?: {
            drawCalls: number
            triangles: number
            geometries: number
            textures: number
            fps: number
          }
        }
      ).__office_debug
      return dbg ?? null
    })
    expect(debugStats).not.toBeNull()
    expect(debugStats!.drawCalls).toBeGreaterThan(0)
    // P05 adds instanced indicators, piles and decor; perf-check / performance.md budget.
    expect(debugStats!.drawCalls).toBeLessThanOrEqual(250)
    console.log('P02_METRICS:', JSON.stringify(debugStats))

    // 2. Floor mode via URL (#/?cam=floor&floor=marketing) + screenshot
    await page.goto('./#/?cam=floor&floor=marketing')
    await expect(canvasWrapper).toHaveAttribute('data-camera-mode-state', 'floor')
    await expect(canvasWrapper).toHaveAttribute('data-focused-floor', 'marketing')
    await expect(
      page.locator('[data-floor-picker-item="marketing"]'),
    ).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('[data-camera-mode="floor"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.waitForTimeout(300)
    const floorShot = await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'p02-floor-marketing.png'),
    })
    await testInfo.attach('p02-floor-marketing', {
      body: floorShot,
      contentType: 'image/png',
    })

    // Keyboard shortcuts: ArrowUp -> design, ArrowDown -> marketing, 2 -> free, Esc -> overview
    await page.keyboard.press('ArrowUp')
    await expect(canvasWrapper).toHaveAttribute('data-focused-floor', 'design')
    await expect(page).toHaveURL(/floor=design/)

    await page.keyboard.press('ArrowDown')
    await expect(canvasWrapper).toHaveAttribute('data-focused-floor', 'marketing')

    // 3. Free mode + screenshot
    await page.goto('./#/?cam=free')
    await expect(canvasWrapper).toHaveAttribute('data-camera-mode-state', 'free')
    await expect(page.locator('[data-camera-mode="free"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.locator('[data-shortcut-hint]')).toContainText('WASD/QE')

    await page.waitForTimeout(300)
    const freeShot = await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'p02-free.png'),
    })
    await testInfo.attach('p02-free', {
      body: freeShot,
      contentType: 'image/png',
    })

    // Esc returns to overview
    await page.keyboard.press('Escape')
    await expect(canvasWrapper).toHaveAttribute('data-camera-mode-state', 'overview')
    await expect(page).toHaveURL(/cam=overview/)

    // Unknown floor key in URL falls back to overview
    await page.goto('./#/?cam=floor&floor=non_existent_floor')
    await expect(canvasWrapper).toHaveAttribute('data-camera-mode-state', 'overview')

    // R11: Live config update adds 9th floor with boss still on top
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __office_debug?: {
            addDepartment: (k: string, vi: string, en: string) => void
          }
        }
      ).__office_debug
      dbg?.addDepartment('logistics', 'Vận hành kho', 'Logistics')
    })

    await expect(pickerItems).toHaveCount(9)
    const updatedKeys = await pickerItems.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-floor-picker-item')),
    )
    expect(updatedKeys[0]).toBe('boss')
    expect(updatedKeys).toContain('logistics')

    // Focus the new floor, then remove it -> falls back to overview (R11)
    await page.locator('[data-floor-picker-item="logistics"]').click()
    await expect(canvasWrapper).toHaveAttribute('data-focused-floor', 'logistics')

    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __office_debug?: {
            removeDepartment: (k: string) => void
          }
        }
      ).__office_debug
      dbg?.removeDepartment('logistics')
    })
    await expect(pickerItems).toHaveCount(8)
    await expect(canvasWrapper).toHaveAttribute('data-camera-mode-state', 'overview')
  })
})

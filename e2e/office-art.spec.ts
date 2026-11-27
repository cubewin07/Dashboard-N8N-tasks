import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const SCREENSHOT_DIR = path.resolve(import.meta.dirname, '../docs/screenshots/p06')
const P06_SHOTS = process.env.P06_SHOTS === '1'

interface OfficeDebug {
  drawCalls: number
  triangles: number
  geometries?: number
  textures?: number
  fps?: number
  floorKeys?: string[]
  sim?: {
    runScenario: (key: string) => void
    setSpeed: (speed: number) => void
  }
}

async function login(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@example.com')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)
}

test.describe('P06b environment art', () => {
  test('desktop: models load, overview budget holds, 4 floor screenshots, and glb assets verified', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'Canvas is desktop only')
    test.setTimeout(120_000)

    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message)
    })

    const glbResponses = new Map<string, number>()
    page.on('response', (res) => {
      const url = res.url()
      if (url.includes('.glb')) {
        const file = url.split('/').pop()?.split('?')[0] ?? url
        glbResponses.set(file, res.status())
      }
    })

    await login(page)

    const canvas = page.locator('[data-office-canvas]')
    await expect(canvas).toBeVisible()
    await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30_000 })
    await expect(canvas).toHaveAttribute('data-assets', 'ready', { timeout: 60_000 })
    await expect(page.locator('[data-load-progress]')).toHaveCount(0)

    // Verify 8 floors present in top-to-bottom order in FloorPicker
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

    // Overview mode assertions
    await expect(canvas).toHaveAttribute('data-camera-mode-state', 'overview')
    await expect(page.locator('[data-camera-mode="overview"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Assert drawCalls on overview
    const debugStats = await page.evaluate(() => {
      const dbg = (window as unknown as { __office_debug?: OfficeDebug }).__office_debug
      return dbg ? { drawCalls: dbg.drawCalls, triangles: dbg.triangles } : null
    })
    expect(debugStats).not.toBeNull()
    expect(debugStats!.drawCalls).toBeGreaterThan(0)
    expect(debugStats!.drawCalls).toBeLessThanOrEqual(150)

    // Assert GLB responses
    expect(glbResponses.size).toBeGreaterThanOrEqual(20)
    for (const [file, status] of glbResponses.entries()) {
      expect(status, `Expected HTTP 200 for ${file}`).toBe(200)
    }

    if (P06_SHOTS) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
      await page.waitForTimeout(500)
      const overviewShot = await canvas.screenshot({
        path: path.join(SCREENSHOT_DIR, 'overview.png'),
      })
      await testInfo.attach('overview', { body: overviewShot, contentType: 'image/png' })
    }

    // Switch to marketing (department)
    await page.locator('[data-floor-picker-item="marketing"]').click()
    await expect(canvas).toHaveAttribute('data-camera-mode-state', 'floor')
    await expect(canvas).toHaveAttribute('data-focused-floor', 'marketing')
    if (P06_SHOTS) {
      await page.waitForTimeout(600)
      const deptShot = await canvas.screenshot({
        path: path.join(SCREENSHOT_DIR, 'department.png'),
      })
      await testInfo.attach('department', { body: deptShot, contentType: 'image/png' })
    }

    // Switch to boss floor
    await page.locator('[data-floor-picker-item="boss"]').click()
    await expect(canvas).toHaveAttribute('data-focused-floor', 'boss')
    if (P06_SHOTS) {
      await page.waitForTimeout(600)
      const bossShot = await canvas.screenshot({
        path: path.join(SCREENSHOT_DIR, 'boss.png'),
      })
      await testInfo.attach('boss', { body: bossShot, contentType: 'image/png' })
    }

    // Switch to games & rest floor
    await page.locator('[data-floor-picker-item="games_rest"]').click()
    await expect(canvas).toHaveAttribute('data-focused-floor', 'games_rest')
    if (P06_SHOTS) {
      await page.waitForTimeout(600)
      const gamesShot = await canvas.screenshot({
        path: path.join(SCREENSHOT_DIR, 'games.png'),
      })
      await testInfo.attach('games', { body: gamesShot, contentType: 'image/png' })
    }

    // Return to overview
    await page.locator('[data-camera-mode="overview"]').click()
    await expect(canvas).toHaveAttribute('data-camera-mode-state', 'overview')

    // Verify no console errors
    expect(consoleErrors).toEqual([])
  })

  test('progressive loading: canvas ready before assets, progress note visible then gone', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'Canvas is desktop only')
    test.setTimeout(90_000)

    // Delay all .glb responses by ~300ms
    await page.route('**/*.glb*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await route.continue()
    })

    await login(page)

    const canvas = page.locator('[data-office-canvas]')
    await expect(canvas).toBeVisible()

    // Canvas reaches data-ready="true" BEFORE data-assets="ready"
    await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 25_000 })
    const assetsStatus = await canvas.getAttribute('data-assets')
    expect(assetsStatus).not.toBe('ready')

    // Progress note visible meanwhile
    const progressNote = page.locator('[data-load-progress]')
    await expect(progressNote).toBeVisible({ timeout: 10_000 })

    // Progress note gone at the end when data-assets reaches "ready"
    await expect(canvas).toHaveAttribute('data-assets', 'ready', { timeout: 60_000 })
    await expect(progressNote).toHaveCount(0)
  })

  test('phone fallback: 375px loads 2D fallback with zero .glb requests', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Phone fallback is phone only')
    test.setTimeout(60_000)

    const glbRequests: string[] = []
    await page.route('**/*.glb*', (route) => {
      glbRequests.push(route.request().url())
      return route.continue()
    })

    await login(page)

    // Wait for 2D fallback (OrgList)
    await expect(page.locator('[data-org-list]')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('canvas')).toHaveCount(0)

    // Assert zero .glb requests
    expect(glbRequests).toEqual([])
  })
})

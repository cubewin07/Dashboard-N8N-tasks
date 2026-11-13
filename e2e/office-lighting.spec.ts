import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { deltaE } from '../src/scene/render/colorDelta'

const OUT_DIR = '/Users/letanthang/.claude/jobs/932208d3/tmp/light'

interface DebugInfo {
  drawCalls: number
  triangles: number
  shadowRenders?: number
  sim?: {
    setSpeed: (speed: 0 | 1 | 30 | 120) => void
    step: (ticks: number) => void
  }
  camera?: {
    getUnlitQuadScreen?: () => [number, number] | null
    setUnlitQuadVisible?: (visible: boolean) => void
  }
}

async function openOffice(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@example.com')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)
  const canvas = page.locator('[data-office-canvas]')
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 25_000 })
  await expect(canvas).toHaveAttribute('data-assets', 'ready', { timeout: 35_000 })
  await expect(page.locator('[data-load-progress]')).toHaveCount(0)
  await page.waitForTimeout(500)
}

function readDebug<T>(page: Page, fn: (dbg: DebugInfo) => T): Promise<T> {
  return page.evaluate((src) => {
    const dbg = (window as unknown as { __office_debug: DebugInfo }).__office_debug
    return new Function('dbg', `return (${src})(dbg)`)(dbg) as T
  }, fn.toString())
}

async function setDayNightEnabled(page: Page, enabled: boolean) {
  const btn = page.locator('[data-day-night]')
  const pressed = await btn.getAttribute('aria-pressed')
  if (pressed !== String(enabled)) {
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', String(enabled))
  }
  await page.waitForTimeout(400)
}

async function samplePixel(
  buffer: Buffer,
  xNorm: number,
  yNorm: number,
): Promise<[number, number, number]> {
  const raw = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
  const x = Math.min(raw.info.width - 1, Math.max(0, Math.round(xNorm * raw.info.width)))
  const y = Math.min(raw.info.height - 1, Math.max(0, Math.round(yNorm * raw.info.height)))
  const idx = (y * raw.info.width + x) * raw.info.channels
  return [raw.data[idx]!, raw.data[idx + 1]!, raw.data[idx + 2]!]
}

test.describe.serial('P06b-T09 office lighting pass', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'The 3D office is desktop-only.')

  test('(a) debug-only unlit jade quad renders within ΔE < 3 of #0F766E', async ({ page }) => {
    test.setTimeout(60_000)
    await openOffice(page)

    // Ensure dayNight is noon
    await setDayNightEnabled(page, false)

    // Show debug-only unlit reference quad
    await readDebug(page, (dbg) => dbg.camera?.setUnlitQuadVisible?.(true))
    await page.waitForTimeout(400)

    // Get unlit reference quad screen coordinates
    const quadScreen = await readDebug(page, (dbg) => dbg.camera?.getUnlitQuadScreen?.() ?? null)
    expect(quadScreen).not.toBeNull()
    const [screenX, screenY] = quadScreen!

    // Capture canvas screenshot
    const canvasLocator = page.locator('canvas')
    const canvasBox = await canvasLocator.boundingBox()
    expect(canvasBox).not.toBeNull()

    const screenshotBuffer = await canvasLocator.screenshot()
    const img = sharp(screenshotBuffer)
    const metadata = await img.metadata()
    const raw = await img.raw().toBuffer({ resolveWithObject: true })

    const scaleX = (metadata.width ?? 1) / canvasBox!.width
    const scaleY = (metadata.height ?? 1) / canvasBox!.height

    const sampleX = Math.round((screenX - canvasBox!.x) * scaleX)
    const sampleY = Math.round((screenY - canvasBox!.y) * scaleY)

    // Sample pixel
    expect(sampleX).toBeGreaterThanOrEqual(0)
    expect(sampleX).toBeLessThan(raw.info.width)
    expect(sampleY).toBeGreaterThanOrEqual(0)
    expect(sampleY).toBeLessThan(raw.info.height)

    const idx = (sampleY * raw.info.width + sampleX) * raw.info.channels
    const r = raw.data[idx]!
    const g = raw.data[idx + 1]!
    const b = raw.data[idx + 2]!

    // Hide debug quad again
    await readDebug(page, (dbg) => dbg.camera?.setUnlitQuadVisible?.(false))

    // Compute perceptual color difference against #0F766E
    const dE = deltaE([r, g, b], '#0F766E')
    console.log(`[lighting] unlit jade_600 pixel=[${r},${g},${b}] deltaE=${dE.toFixed(4)}`)
    // Acceptance: palette swatch jade_600 renders within ΔE < 3
    expect(dE).toBeLessThan(3)
  })

  test('(b) shadowRenders does not grow over ~1 s idle and grows ≥1 after a floor focus change', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await openOffice(page)

    // Initial shadow renders after bake
    const initialRenders = await readDebug(page, (dbg) => dbg.shadowRenders ?? 0)
    const overviewCalls = await readDebug(page, (dbg) => dbg.drawCalls)
    console.log(`[lighting] overview initial shadowRenders=${initialRenders} drawCalls=${overviewCalls}`)
    expect(initialRenders).toBeGreaterThanOrEqual(1)

    // Wait ~1.2s idle: shadowRenders must NOT grow
    await page.waitForTimeout(1200)
    const idleRenders = await readDebug(page, (dbg) => dbg.shadowRenders ?? 0)
    expect(idleRenders).toBe(initialRenders)

    // Trigger floor focus change to marketing
    const marketingItem = page.locator('[data-floor-picker-item="marketing"]')
    await marketingItem.click()
    await expect(page.locator('[data-office-canvas]')).toHaveAttribute('data-focused-floor', 'marketing', {
      timeout: 5000,
    })
    await page.waitForTimeout(600)

    // shadowRenders must have grown by at least 1
    const focusedRenders = await readDebug(page, (dbg) => dbg.shadowRenders ?? 0)
    const marketingCalls = await readDebug(page, (dbg) => dbg.drawCalls)
    console.log(`[lighting] marketing shadowRenders=${focusedRenders} drawCalls=${marketingCalls}`)
    expect(focusedRenders).toBeGreaterThanOrEqual(idleRenders + 1)
  })

  test('(c) capture after screenshots: overview and marketing floor at noon and night', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await openOffice(page)
    await readDebug(page, (dbg) => dbg.camera?.setUnlitQuadVisible?.(false))

    const canvas = page.locator('canvas')

    // 1. Overview noon
    await setDayNightEnabled(page, false)
    await page.waitForTimeout(500)
    const overviewNoonBuf = await canvas.screenshot({
      path: path.join(OUT_DIR, 'overview_noon_after.png'),
    })
    const noonSky = await samplePixel(overviewNoonBuf, 0.9, 0.2)
    const overviewCalls = await readDebug(page, (dbg) => dbg.drawCalls)
    console.log(`[lighting] overview_noon sky=[${noonSky.join(',')}] drawCalls=${overviewCalls}`)

    // Advance sim clock by ~14 hours (from 08:00 ICT -> 22:00 ICT) so night lighting applies
    await readDebug(page, (dbg) => {
      dbg.sim?.setSpeed(120)
      dbg.sim?.step(1680)
      dbg.sim?.setSpeed(0)
    })

    // 2. Overview night
    await setDayNightEnabled(page, true)
    await page.waitForTimeout(500)
    const overviewNightBuf = await canvas.screenshot({
      path: path.join(OUT_DIR, 'overview_night_after.png'),
    })
    const nightSky = await samplePixel(overviewNightBuf, 0.9, 0.2)
    console.log(`[lighting] overview_night sky=[${nightSky.join(',')}]`)
    expect(nightSky[0]).toBeLessThan(noonSky[0] - 50)
    expect(nightSky[2]).toBeGreaterThan(nightSky[0])

    // 3. Marketing floor noon
    const marketingPicker = page.locator('[data-floor-picker-item="marketing"]')
    await marketingPicker.click()
    await expect(page.locator('[data-office-canvas]')).toHaveAttribute('data-focused-floor', 'marketing', {
      timeout: 5000,
    })
    await setDayNightEnabled(page, false)
    await page.waitForTimeout(600)
    const marketingNoonBuf = await canvas.screenshot({
      path: path.join(OUT_DIR, 'marketing_noon_after.png'),
    })
    const marketingNoonSky = await samplePixel(marketingNoonBuf, 0.9, 0.15)
    const marketingCalls = await readDebug(page, (dbg) => dbg.drawCalls)
    console.log(`[lighting] marketing_noon sky=[${marketingNoonSky.join(',')}] drawCalls=${marketingCalls}`)

    // 4. Marketing floor night
    await setDayNightEnabled(page, true)
    await page.waitForTimeout(600)
    const marketingNightBuf = await canvas.screenshot({
      path: path.join(OUT_DIR, 'marketing_night_after.png'),
    })
    const marketingNightSky = await samplePixel(marketingNightBuf, 0.9, 0.15)
    console.log(`[lighting] marketing_night sky=[${marketingNightSky.join(',')}]`)
    expect(marketingNightSky[0]).toBeLessThan(marketingNoonSky[0] - 50)
    expect(marketingNightSky[2]).toBeGreaterThan(marketingNightSky[0])
  })
})

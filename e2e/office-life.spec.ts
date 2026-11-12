import { expect, test, type Page } from '@playwright/test'

interface Debug {
  drawCalls: number
  sim?: { runScenario: (key: string) => void; setSpeed: (speed: number) => void }
  director: {
    indicators: () => { rings: number; icons: number; badges: number; emotes: number }
    namesInUse: () => number
    ringPulse: () => number
    lodBands: () => string[]
    people: () => { id: string }[]
  }
}

async function openOffice(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@example.com')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)
  const canvas = page.locator('[data-office-canvas]')
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
}

function read<T>(page: Page, fn: (dbg: Debug) => T): Promise<T> {
  return page.evaluate(
    (src) => {
      const dbg = (window as unknown as { __office_debug: Debug }).__office_debug
      return new Function('dbg', `return (${src})(dbg)`)(dbg) as T
    },
    fn.toString(),
  )
}

test.describe('P05 office life', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'The 3D office is desktop-only.')

  test('busy day: rings, icons and badges are drawn within the draw-call budget', async ({ page }) => {
    await openOffice(page)
    await read(page, (dbg) => {
      dbg.sim!.runScenario('busy_day')
      dbg.sim!.setSpeed(30)
    })
    await expect
      .poll(() => read(page, (dbg) => dbg.director.indicators().rings), { timeout: 20_000 })
      .toBeGreaterThan(5)
    const ind = await read(page, (dbg) => dbg.director.indicators())
    expect(ind.emotes).toBeLessThanOrEqual(12)

    // Icons and badges are mid/near only (R12); rings show at every band.
    const bands = await read(page, (dbg) => dbg.director.lodBands())
    if (bands.some((b) => b !== 'far')) expect(ind.icons).toBeGreaterThan(0)
    expect(bands.length).toBeGreaterThan(3)
    const names = await read(page, (dbg) => dbg.director.namesInUse())
    expect(names).toBeLessThanOrEqual(40)
    if (bands.every((b) => b === 'far')) expect(names).toBe(0)

    const calls = await read(page, (dbg) => dbg.drawCalls)
    expect(calls).toBeLessThan(250)
  })

  test('reduced motion stops the ring pulse', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openOffice(page)
    await read(page, (dbg) => dbg.sim!.runScenario('busy_day'))
    await expect.poll(() => read(page, (dbg) => dbg.director.ringPulse()), { timeout: 10_000 }).toBe(0)
  })
})

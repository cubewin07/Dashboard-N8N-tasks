import { expect, test, type Page } from '@playwright/test'

interface Debug {
  drawCalls: number
  sim?: { runScenario: (key: string) => void; setSpeed: (speed: number) => void }
  camera: { follow: (id: string | null) => void }
  director: {
    indicators: () => { rings: number; icons: number; badges: number; emotes: number }
    namesInUse: () => number
    ringPulse: () => number
    lodBands: () => string[]
    people: () => { id: string; visible: boolean }[]
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
    // Rings show at every band, so the busy day must put several on screen.
    await expect
      .poll(() => read(page, (dbg) => dbg.director.indicators().rings), { timeout: 20_000 })
      .toBeGreaterThan(5)
    expect(await read(page, (dbg) => dbg.director.people().length)).toBeGreaterThan(5)

    // Icons and badges are mid/near only (R12): none at overview zoom, some once the camera is close.
    const far = await read(page, (dbg) => dbg.director.indicators())
    const farBands = await read(page, (dbg) => dbg.director.lodBands())
    expect(farBands.length).toBeGreaterThan(3)
    expect(farBands.every((b) => b === 'far')).toBe(true)
    expect(far.icons).toBe(0)
    expect(far.badges).toBe(0)
    expect(await read(page, (dbg) => dbg.director.namesInUse())).toBe(0)

    // Follow a person who has a status: the camera comes close and the symbols appear.
    await read(page, (dbg) => {
      const first = dbg.director.people().find((p) => p.visible)
      if (first) dbg.camera.follow(first.id)
    })
    await expect
      .poll(() => read(page, (dbg) => dbg.director.lodBands().some((b) => b !== 'far')), { timeout: 20_000 })
      .toBe(true)
    await expect
      .poll(() => read(page, (dbg) => dbg.director.indicators().icons), { timeout: 20_000 })
      .toBeGreaterThan(0)
    const near = await read(page, (dbg) => dbg.director.indicators())
    expect(near.rings).toBeGreaterThan(0)
    expect(near.emotes).toBeLessThanOrEqual(12)
    expect(await read(page, (dbg) => dbg.director.ringPulse())).toBeGreaterThan(0)

    // Something is really drawn, and within the budget.
    const calls = await read(page, (dbg) => dbg.drawCalls)
    expect(calls).toBeGreaterThan(20)
    expect(calls).toBeLessThan(250)
  })

  test('reduced motion stops the ring pulse', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openOffice(page)
    await read(page, (dbg) => dbg.sim!.runScenario('busy_day'))
    // Rings are on screen (so the pulse value is read from a live layer), and still.
    await expect
      .poll(() => read(page, (dbg) => dbg.director.indicators().rings), { timeout: 20_000 })
      .toBeGreaterThan(0)
    expect(await read(page, (dbg) => dbg.director.ringPulse())).toBe(0)
  })
})

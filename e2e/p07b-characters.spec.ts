import { expect, test, type Page } from '@playwright/test'

interface CharactersDebugState {
  assembled: number
  total: number
  queued: number
  failed: number
  cacheSize: number
  mixersPerSec: number
  avgAssemblyMs: number
  setAppearance: (employeeId: string, doc: unknown) => unknown
  setFailUrlForTest: (pattern: string | null) => void
}

interface OfficeDebugHandle {
  drawCalls: number
  triangles: number
  director: {
    people: () => Array<{ id: string; x: number; y: number; z: number; floorKey: string }>
  }
  characters?: CharactersDebugState
}

async function openOffice(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@example.com')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)

  const canvas = page.locator('[data-office-canvas]')
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 25_000 })
  await expect(canvas).toHaveAttribute('data-assets', 'ready', { timeout: 45_000 })
}

test.describe('P07b assembled 3D characters', () => {
  test('all active employees assemble cleanly, support live appearance swap, and fall back safely on load error', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', '3D characters run on desktop')
    test.setTimeout(90_000)

    const pageErrors: string[] = []
    const charErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('[CharacterPeople]')) {
        charErrors.push(msg.text())
      }
    })

    await openOffice(page)

    const initial = await page.evaluate(() => {
      const dbg = (window as unknown as { __office_debug?: OfficeDebugHandle }).__office_debug
      return {
        peopleCount: dbg?.director?.people().length ?? 0,
        firstId: dbg?.director?.people()[0]?.id ?? null,
        hasCharacters: Boolean(dbg?.characters),
      }
    })
    expect(initial.hasCharacters).toBe(true)
    expect(initial.peopleCount).toBeGreaterThan(20)
    expect(initial.firstId).not.toBeNull()

    // Wait for progressive (<= 2/frame) assembly queue to finish cleanly.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const dbg = (window as unknown as { __office_debug?: OfficeDebugHandle }).__office_debug
            const people = dbg?.director?.people().length ?? 0
            const c = dbg?.characters
            if (!c || people === 0) return null
            return {
              assembled: c.assembled,
              total: c.total,
              queued: c.queued,
              failed: c.failed,
              cacheSize: c.cacheSize,
              people,
              drawCalls: dbg?.drawCalls ?? 0,
            }
          }),
        { timeout: 30_000 },
      )
      .toMatchObject({
        assembled: initial.peopleCount,
        total: initial.peopleCount,
        queued: 0,
        failed: 0,
        cacheSize: initial.peopleCount,
      })

    const metrics = await page.evaluate(() => {
      const dbg = (window as unknown as { __office_debug?: OfficeDebugHandle }).__office_debug
      return {
        drawCalls: dbg?.drawCalls ?? 0,
        avgAssemblyMs: dbg?.characters?.avgAssemblyMs ?? -1,
      }
    })
    expect(metrics.drawCalls).toBeGreaterThan(0)
    expect(metrics.drawCalls).toBeLessThanOrEqual(250)
    expect(metrics.avgAssemblyMs).toBeGreaterThan(0)
    expect(metrics.avgAssemblyMs).toBeLessThan(25)

    // Runtime appearance swap on one employee updates cleanly without failures or cache bloat.
    const empId = initial.firstId!
    await page.evaluate((id) => {
      const dbg = (window as unknown as { __office_debug?: OfficeDebugHandle }).__office_debug
      dbg?.characters?.setAppearance(id, {
        v: 1,
        base: 'male',
        skin: 'skin_02',
        hair: { item: 'hair_short_01', color: 'hair_auburn' },
        outfit: {
          top: 'top_tshirt_crew_01',
          bottom: 'bottom_trousers_01',
          fullbody: null,
          outer: null,
          shoes: 'shoes_sneaker_01',
        },
        body: { height: 0.85, build: 0.6, muscle: 0.4, chest: 0.2, hips: 0.2, shoulders: 0.5 },
      })
    }, empId)

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const c = (window as unknown as { __office_debug?: OfficeDebugHandle }).__office_debug?.characters
            return c
              ? { assembled: c.assembled, queued: c.queued, failed: c.failed, cacheSize: c.cacheSize }
              : null
          }),
        { timeout: 15_000 },
      )
      .toEqual({
        assembled: initial.peopleCount,
        queued: 0,
        failed: 0,
        cacheSize: initial.peopleCount,
      })

    // Simulated broken wardrobe URL triggers capsule fallback + single console.error without crashing.
    await page.evaluate((id) => {
      const dbg = (window as unknown as { __office_debug?: OfficeDebugHandle }).__office_debug
      dbg?.characters?.setFailUrlForTest('hair_short_01')
      dbg?.characters?.setAppearance(id, {
        v: 1,
        base: 'female',
        skin: 'skin_03',
        hair: { item: 'hair_short_01', color: 'hair_blonde' },
        outfit: {
          top: 'top_tshirt_crew_01',
          bottom: 'bottom_trousers_01',
          fullbody: null,
          outer: null,
          shoes: 'shoes_sneaker_01',
        },
      })
    }, empId)

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const c = (window as unknown as { __office_debug?: OfficeDebugHandle }).__office_debug?.characters
            return c ? { assembled: c.assembled, queued: c.queued, failed: c.failed } : null
          }),
        { timeout: 15_000 },
      )
      .toEqual({
        assembled: initial.peopleCount - 1,
        queued: 0,
        failed: 1,
      })

    // Allow a couple extra render frames and verify console.error did not repeat.
    await page.waitForTimeout(300)
    expect(charErrors).toHaveLength(1)
    expect(pageErrors).toEqual([])

    // Clear test failure injection and verify recovery.
    await page.evaluate((id) => {
      const dbg = (window as unknown as { __office_debug?: OfficeDebugHandle }).__office_debug
      dbg?.characters?.setFailUrlForTest(null)
      dbg?.characters?.setAppearance(id, {
        v: 1,
        base: 'female',
        skin: 'skin_03',
        hair: { item: 'hair_short_01', color: 'hair_blonde' },
        outfit: {
          top: 'top_tshirt_crew_01',
          bottom: 'bottom_trousers_01',
          fullbody: null,
          outer: null,
          shoes: 'shoes_sneaker_01',
        },
      })
    }, empId)

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const c = (window as unknown as { __office_debug?: OfficeDebugHandle }).__office_debug?.characters
            return c ? { assembled: c.assembled, queued: c.queued, failed: c.failed } : null
          }),
        { timeout: 15_000 },
      )
      .toEqual({
        assembled: initial.peopleCount,
        queued: 0,
        failed: 0,
      })
  })
})
